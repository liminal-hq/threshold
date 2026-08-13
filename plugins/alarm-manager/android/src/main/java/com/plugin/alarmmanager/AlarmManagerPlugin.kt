// Android alarm manager plugin bridge for scheduling, launch args, and alarm-fired callbacks
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import android.util.Log
import androidx.activity.result.ActivityResult
import android.content.BroadcastReceiver
import android.content.IntentFilter
import ca.liminalhq.threshold.nativebus.DurableEventQueue
import ca.liminalhq.threshold.nativebus.KeyValueStore
import ca.liminalhq.threshold.nativebus.SharedPreferencesKeyValueStore
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "AlarmManagerPlugin"
private const val CALLBACK_PREFS = "AlarmManagerCallbacks"

// Topics are the existing Tauri event names these four channels ultimately emit as (see plugins/alarm-manager/src/mobile.rs) -- reusing them as DurableEventQueue topics means the unified log's contents are self-describing without inventing a second naming scheme. `internal` (not `private`) so this file's JUnit tests can reference the exact same strings rather than duplicating them.
internal const val TOPIC_FIRED = "alarm-manager:native-fired"
internal const val TOPIC_SNOOZE = "alarm-manager:snooze-requested"
internal const val TOPIC_DISMISS = "alarm-manager:dismiss-requested"
internal const val TOPIC_IMPORT = "alarm-manager:import-requested"

// The single unified log, replacing the four legacy keys below. Same prefs file as the legacy queues (CALLBACK_PREFS) -- only the key, and the fact there's now just one of them, changes.
internal const val EVENT_LOG_KEY = "event_log"

// Pre-migration queue keys. Only ever read by migrateLegacyQueues(), which removes them once their contents have been folded into EVENT_LOG_KEY -- see that function for the one-time migration this repo's release notes call out.
internal const val LEGACY_KEY_PENDING_ALARM_EVENTS = "pending_alarm_events"
internal const val LEGACY_KEY_PENDING_SNOOZE_EVENTS = "pending_snooze_events"
internal const val LEGACY_KEY_PENDING_DISMISS_EVENTS = "pending_dismiss_events"
internal const val LEGACY_KEY_PENDING_IMPORT_EVENTS = "pending_import_events"

/**
 * One-time migration off the four legacy per-type queues (pre-[DurableEventQueue]) onto the unified event log under [EVENT_LOG_KEY] in [store]. Returns the number of entries migrated.
 *
 * Production devices have been observed carrying pending entries across multiple days, so this folds any leftovers into the new log -- preserving each entry's own data -- rather than silently dropping them. This is one-way: once the legacy keys are removed here, a downgrade to a build that only knows the old queues would no longer see events left in the new log (see RELEASE_NOTES.md).
 *
 * [DurableEventQueue.enqueue] always stamps `publishedAt` from the wall clock, which isn't what we want here -- migrated entries should drain in a sensible relative order (fired events by their own `actualFiredAt`; the others, which never recorded a timestamp, by their original per-queue array position) rather than all colliding on the single instant migration happened to run. Since the public API has no seam for supplying an explicit `publishedAt`, this writes envelopes directly into the log's JSON array using the same "v"/"topic"/"payload"/"eventId"/"publishedAt"/"handledNatively" schema [DurableEventQueue] itself reads (see its KDoc and `DurableEventQueueTest`'s `writeRawEnvelopes` helper for the same technique) -- a deliberate, documented duplication of that private schema, acceptable because it's exercised by this file's own migration tests.
 *
 * A standalone function operating purely against [KeyValueStore] (not SharedPreferences/Context directly) so it's unit-testable against an in-memory fake -- mirrors `resolveActiveDays` in `SetAlarmActivity.kt`.
 */
internal fun migrateLegacyQueues(store: KeyValueStore): Int {
    val legacyKeys = listOf(
        LEGACY_KEY_PENDING_ALARM_EVENTS,
        LEGACY_KEY_PENDING_SNOOZE_EVENTS,
        LEGACY_KEY_PENDING_DISMISS_EVENTS,
        LEGACY_KEY_PENDING_IMPORT_EVENTS,
    )
    // The pre-migration drain code these queues replace never removed a legacy key once drained -- it always rewrote the queue back to "[]" instead. So on essentially any device that's ever used alarms, all four legacy keys already exist by the time this runs; a plain non-null check would make this fast path never actually trigger. Parsing each one and checking for a genuinely non-empty array is what actually distinguishes "has real pending data" from "exists but was already drained to empty".
    if (legacyKeys.none { hasPendingLegacyEntries(store.get(it)) }) return 0

    val envelopes = JSONArray()
    try {
        val existing = JSONArray(store.get(EVENT_LOG_KEY) ?: "[]")
        for (i in 0 until existing.length()) envelopes.put(existing.get(i))
    } catch (e: Exception) {
        Log.w(TAG, "Existing event log under '$EVENT_LOG_KEY' was corrupt, discarding it before migration", e)
    }

    // Fallback publishedAt for legacy entries that never recorded their own timestamp (snooze/dismiss/import): now, offset by each entry's index within its own legacy array. The entries in each legacy array are already in chronological (append) order, so the offset preserves that relative order without every migrated entry colliding on the exact same millisecond.
    val fallbackBase = System.currentTimeMillis()

    var migratedCount = 0
    migratedCount += migrateLegacyArray(store, LEGACY_KEY_PENDING_ALARM_EVENTS, TOPIC_FIRED, envelopes) { item, index ->
        val payload = JSONObject().apply {
            put("id", item.optInt("id", -1))
            put("actualFiredAt", item.optLong("actualFiredAt", fallbackBase + index))
        }
        val publishedAt = if (item.has("actualFiredAt")) {
            item.optLong("actualFiredAt", fallbackBase + index)
        } else {
            fallbackBase + index
        }
        payload to publishedAt
    }
    migratedCount += migrateLegacyArray(store, LEGACY_KEY_PENDING_SNOOZE_EVENTS, TOPIC_SNOOZE, envelopes) { item, index ->
        JSONObject().apply { put("id", item.optInt("id", -1)) } to fallbackBase + index
    }
    migratedCount += migrateLegacyArray(store, LEGACY_KEY_PENDING_DISMISS_EVENTS, TOPIC_DISMISS, envelopes) { item, index ->
        JSONObject().apply { put("id", item.optInt("id", -1)) } to fallbackBase + index
    }
    migratedCount += migrateLegacyArray(store, LEGACY_KEY_PENDING_IMPORT_EVENTS, TOPIC_IMPORT, envelopes) { item, index ->
        val payload = JSONObject().apply {
            put("id", item.optInt("id", -1))
            put("hour", item.optInt("hour", 0))
            put("minute", item.optInt("minute", 0))
            put("label", item.optString("label", ""))
            put("activeDays", item.optJSONArray("activeDays") ?: JSONArray())
            put("triggerAt", item.optLong("triggerAt", 0))
        }
        payload to fallbackBase + index
    }

    // Written as one atomic batch rather than a separate set() + four remove() calls: if the process were killed between them, the next launch would see the new log already holding these entries but the legacy keys still present with their original data, re-trigger migration, and duplicate every entry in the log (each one reported to Rust twice -- e.g. the same alarm fired/dismissed twice). Batching makes that intermediate state unobservable -- either both the log write and all four removals land, or neither does.
    val sets = if (migratedCount > 0) mapOf(EVENT_LOG_KEY to envelopes.toString()) else emptyMap()
    store.batch(sets = sets, removes = legacyKeys.toSet())
    return migratedCount
}

/**
 * Whether [raw] (a legacy queue's raw stored value) holds at least one entry worth migrating. `null` (never set) and a parsed-empty array (`"[]"`, or equivalent with whitespace) both mean "nothing to migrate" -- the latter matters because the pre-migration drain code always rewrote a queue back to `"[]"` after draining it rather than removing the key, so a non-null check alone can't tell "never had anything" apart from "already drained". Malformed JSON is treated as "has something" so the real per-key parse in [migrateLegacyArray] (which already tolerates and logs corrupt JSON) is what handles it, rather than this fast-path guard silently skipping a corrupt-but-non-empty legacy queue.
 */
private fun hasPendingLegacyEntries(raw: String?): Boolean {
    if (raw.isNullOrEmpty()) return false
    return try {
        JSONArray(raw).length() > 0
    } catch (e: Exception) {
        true
    }
}

/**
 * Migrates one legacy queue array (under [legacyKey] in [store]) into [outEnvelopes], skipping entries with no valid `id`. [toPayloadAndPublishedAt] receives each legacy item plus its index within its own legacy array and returns the new-schema payload object and the `publishedAt` to stamp it with. Returns the number of entries migrated.
 */
private fun migrateLegacyArray(
    store: KeyValueStore,
    legacyKey: String,
    topic: String,
    outEnvelopes: JSONArray,
    toPayloadAndPublishedAt: (item: JSONObject, index: Int) -> Pair<JSONObject, Long>,
): Int {
    val raw = store.get(legacyKey) ?: return 0
    val array = try {
        JSONArray(raw)
    } catch (e: Exception) {
        Log.w(TAG, "Legacy queue under '$legacyKey' was corrupt, dropping it during migration", e)
        return 0
    }

    var count = 0
    for (i in 0 until array.length()) {
        val item = array.optJSONObject(i) ?: continue
        val id = item.optInt("id", -1)
        if (id <= 0) continue

        val (payload, publishedAt) = toPayloadAndPublishedAt(item, i)
        outEnvelopes.put(
            JSONObject().apply {
                put("v", DurableEventQueue.SCHEMA_VERSION)
                put("topic", topic)
                put("payload", payload.toString())
                put("eventId", java.util.UUID.randomUUID().toString())
                put("publishedAt", publishedAt)
                put("handledNatively", JSONArray())
            },
        )
        count++
    }
    return count
}

/**
 * Drains every entry in [queue] (across every topic, in chronological [DurableEventQueue.Envelope.publishedAt] order) and hands each one to [dispatch], which attempts delivery for the given topic/payload and returns whether it succeeded. Only successfully-dispatched entries are committed (removed) from [queue] -- anything [dispatch] returns `false` for stays queued for a later retry, mirroring the pre-migration per-type drain/replay behaviour. Returns the number of entries actually dispatched.
 *
 * A standalone function (not a method) so it's unit-testable against a real [DurableEventQueue]/in-memory [KeyValueStore] pair, with a fake [dispatch], and no Android framework (Context, Channel) involved at all -- mirrors [migrateLegacyQueues] above.
 *
 * Two consequences of this design are intentional, not oversights, per issue #255's Unified design (decision 7: every event flows through the log; drain-now replaces the old two-path split; total order is preserved by draining everything, across all four topics, in chronological order on every call):
 * - A process kill mid-drain -- after some [dispatch] calls have already succeeded but before the trailing [DurableEventQueue.commit] runs -- can redeliver already-delivered entries (possibly for a different topic than whichever call triggered this drain) on the next launch. Issue #255's Phase 3C adds Rust-side last-N eventId dedup specifically to absorb this.
 * - [enqueueAndDrain] below drains the *entire* cross-topic backlog synchronously on every single event, not just the topic that was just enqueued -- if a large backlog has built up, this could run long enough to threaten `AlarmReceiver.onReceive()`'s ANR budget. Issue #255's Phase 3A closes this by wrapping `onReceive()` in `goAsync()`.
 */
internal fun drainAndDispatch(queue: DurableEventQueue, dispatch: (topic: String, payload: String) -> Boolean): Int {
    val drained = queue.drainAll(pipelineReady = true)
    if (drained.isEmpty()) return 0

    val handledEventIds = mutableSetOf<String>()
    for (envelope in drained) {
        if (dispatch(envelope.topic, enrichPayloadForDispatch(envelope))) {
            handledEventIds.add(envelope.eventId)
        }
    }
    if (handledEventIds.isNotEmpty()) queue.commit(handledEventIds)
    return handledEventIds.size
}

/**
 * Returns [envelope]'s payload as-is, except for [TOPIC_FIRED] where it's enriched with
 * `eventId`/`handledNatively` before dispatch -- per
 * docs/architecture/255-phase3-payload-contract.md, these are the two fields Rust's
 * `NativeAlarmFiredPayload` needs to carry the tags `AlarmReceiver.kt`'s `publishAlarmFiredToBus`
 * collected (e.g. `"watch-ring"`) and the envelope's own stable ID through to the
 * `alarm-manager:native-fired` Tauri event, whether this is the immediate post-enqueue drain or
 * a later retry of the same queued entry. Only [TOPIC_FIRED] gains these fields -- the contract
 * only specifies them for the fired event, and the other three topics' Rust payload structs
 * don't declare them.
 *
 * [envelope.payload][DurableEventQueue.Envelope.payload] is always caller-constructed JSON (see
 * [notifyAlarmFired]), so re-parsing it here should never fail in practice -- the `catch` exists
 * only to fail safe (dispatch the entry unenriched rather than drop it) if it somehow does.
 */
internal fun enrichPayloadForDispatch(envelope: DurableEventQueue.Envelope): String {
    if (envelope.topic != TOPIC_FIRED) return envelope.payload
    return try {
        JSONObject(envelope.payload).apply {
            put("eventId", envelope.eventId)
            put("handledNatively", JSONArray(envelope.handledNatively.toList()))
        }.toString()
    } catch (e: Exception) {
        Log.w(TAG, "Failed to enrich fired-event payload for eventId ${envelope.eventId}, dispatching unenriched", e)
        envelope.payload
    }
}

private fun keyValueStore(context: Context): KeyValueStore = SharedPreferencesKeyValueStore(context, CALLBACK_PREFS)

private fun eventQueue(context: Context): DurableEventQueue = DurableEventQueue(keyValueStore(context), EVENT_LOG_KEY)

@InvokeArg
class ScheduleRequest {
    var id: Int = 0
    var triggerAt: Long = 0
    var soundUri: String? = null
}

@InvokeArg
class CancelRequest {
    var id: Int = 0
}

@InvokeArg
class PickAlarmSoundOptions {
    var existingUri: String? = null
    var title: String? = null
    var showSilent: Boolean = true
    var showDefault: Boolean = true
}

@InvokeArg
class AlarmEventHandlerArgs {
    lateinit var handler: Channel
}

@InvokeArg
class SnoozeEventHandlerArgs {
    lateinit var handler: Channel
}

@InvokeArg
class DismissEventHandlerArgs {
    lateinit var handler: Channel
}

@InvokeArg
class ImportEventHandlerArgs {
    lateinit var handler: Channel
}

@TauriPlugin
class AlarmManagerPlugin(private val activity: android.app.Activity) : Plugin(activity) {
    private var alarmEventChannel: Channel? = null
    private var snoozeEventChannel: Channel? = null
    private var dismissEventChannel: Channel? = null
    private var importEventChannel: Channel? = null
    @Volatile
    private var alarmPipelineReady: Boolean = false

    companion object {
        @Volatile
        var instance: AlarmManagerPlugin? = null
            private set

        @Synchronized
        fun notifyAlarmFired(
            context: Context,
            alarmId: Int,
            actualFiredAt: Long = System.currentTimeMillis(),
            handledNatively: Set<String> = emptySet(),
        ) {
            if (alarmId <= 0) return
            val payload = JSONObject().apply {
                put("id", alarmId)
                put("actualFiredAt", actualFiredAt)
            }
            enqueueAndDrain(context, TOPIC_FIRED, payload, handledNatively)
        }

        @Synchronized
        fun notifySnoozeRequested(context: Context, alarmId: Int) {
            if (alarmId <= 0) return
            val payload = JSONObject().apply { put("id", alarmId) }
            enqueueAndDrain(context, TOPIC_SNOOZE, payload)
        }

        @Synchronized
        fun notifyAlarmDismissed(context: Context, alarmId: Int) {
            if (alarmId <= 0) return
            val payload = JSONObject().apply { put("id", alarmId) }
            enqueueAndDrain(context, TOPIC_DISMISS, payload)
        }

        @Synchronized
        fun notifyImportRequested(
            context: Context,
            id: Int,
            hour: Int,
            minute: Int,
            label: String,
            activeDays: List<Int>,
            triggerAt: Long,
        ) {
            if (id <= 0) return
            val payload = JSONObject().apply {
                put("id", id)
                put("hour", hour)
                put("minute", minute)
                put("label", label)
                put("activeDays", JSONArray(activeDays))
                put("triggerAt", triggerAt)
            }
            enqueueAndDrain(context, TOPIC_IMPORT, payload)
        }

        // Every event flows through the log -- there is no separate "dispatch immediately" path any more. When the pipeline is already up and the right channel is registered, drainQueuedEvents() below delivers this same entry within the same call, so the net effect (and latency) matches the old immediate-dispatch path; when it isn't, the entry simply stays in the log until markAlarmPipelineReady() (or a later event of any topic) drains it. See drainAndDispatch()'s KDoc for the two deliberate, forward-referenced (issue #255) consequences of always draining the whole backlog.
        @Synchronized
        private fun enqueueAndDrain(
            context: Context,
            topic: String,
            payload: JSONObject,
            handledNatively: Set<String> = emptySet(),
        ) {
            val eventId = eventQueue(context).enqueue(topic, payload.toString(), handledNatively)
            NativeEventLog.log(context, TAG, "Enqueued '$topic' event $eventId: $payload")
            instance?.drainQueuedEvents()
        }
    }

    override fun load(webView: WebView) {
        super.load(webView)
        instance = this
        Log.d(TAG, "Plugin loaded.")

        val migratedCount = migrateLegacyQueues(keyValueStore(activity))
        if (migratedCount > 0) {
            Log.i(TAG, "Migrated $migratedCount legacy queued event(s) into the unified event log")
            NativeEventLog.log(
                activity,
                TAG,
                "Migrated $migratedCount legacy queued event(s) into the unified event log",
            )
        }

        applyRingingWindowFlags(activity.intent)
        drainQueuedEvents()
    }

    override fun onNewIntent(intent: Intent) {
        // TauriActivity's own onNewIntent dispatches here but doesn't update the activity's
        // intent itself -- without this, activity.intent stays pinned to the stale cold-start
        // intent instead of the one carrying the alarm trigger data.
        activity.intent = intent
        applyRingingWindowFlags(intent)
    }

    // The manifest's showWhenLocked/turnScreenOn attributes alone aren't reliably honoured
    // for an activity launched via a notification's full-screen intent on every OS version --
    // set them again here as a defensive backstop so the ringing screen actually occludes the
    // keyguard instead of appearing underneath it. Scoped to the ringing deep link only, so a
    // normal app launch while the phone is locked still requires authentication as expected.
    private fun applyRingingWindowFlags(intent: Intent?) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) return
        if (intent?.data?.host == "ringing") {
            activity.setShowWhenLocked(true)
            activity.setTurnScreenOn(true)
        }
    }

    @Command
    fun schedule(invoke: Invoke) {
        val args = invoke.parseArgs(ScheduleRequest::class.java)

        // TODO: Remove this compatibility command once scheduling is fully event-driven.
        AlarmUtils.scheduleAlarm(activity, args.id, args.triggerAt, args.soundUri)
        invoke.resolve()
    }

    @Command
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(CancelRequest::class.java)

        // TODO: Remove this compatibility command once cancellation is fully event-driven.
        AlarmUtils.cancelAlarm(activity, args.id)
        invoke.resolve()
    }

    @Command
    fun pickAlarmSound(invoke: Invoke) {
        val args = invoke.parseArgs(PickAlarmSoundOptions::class.java)

        val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, args.showSilent)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, args.showDefault)
            if (args.title != null) {
                putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, args.title)
            }
            if (args.existingUri != null) {
                putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(args.existingUri))
            }
        }

        startActivityForResult(invoke, intent, "pickAlarmSoundResult")
    }

    @Command
    fun stopRinging(invoke: Invoke) {
        Log.d(TAG, "Stopping ringing service via Intent")
        val intent = Intent(activity, AlarmRingingService::class.java).apply {
            action = AlarmRingingService.ACTION_DISMISS
        }
        activity.startService(intent)
        // Every path out of the ringing screen (dismiss, snooze, silence-timeout) calls this,
        // so it's the one place to clear the keyguard-bypass flags applyRingingWindowFlags()
        // set -- otherwise they'd stay on for the rest of this Activity instance's life, and a
        // later, unrelated app open while locked could bypass the lock screen too.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            activity.setShowWhenLocked(false)
            activity.setTurnScreenOn(false)
        }
        invoke.resolve()
    }

    // Android 14+ (API 34) made USE_FULL_SCREEN_INTENT a user-revocable special permission
    // (Settings > Apps > Threshold > Special app access > "Full screen intent notifications").
    // When it's off, canUseFullScreenIntent() returns false and the OS silently downgrades the
    // ringing notification's full-screen intent to an ordinary heads-up banner instead of
    // launching the ringing Activity -- no error, no callback. Below API 34 the permission is
    // granted unconditionally by declaring it in the manifest, so there's nothing to check.
    @Command
    fun checkFullScreenIntentPermission(invoke: Invoke) {
        val granted = if (Build.VERSION.SDK_INT >= 34) {
            val notificationManager =
                activity.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            notificationManager.canUseFullScreenIntent()
        } else {
            true
        }
        val ret = JSObject()
        ret.put("granted", granted)
        invoke.resolve(ret)
    }

    @Command
    fun openFullScreenIntentSettings(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= 34) {
            val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivity(intent)
        }
        invoke.resolve()
    }

    // Android 12+ (API 31) made scheduling an exact alarm ("clock/alarm" apps) a user-revocable
    // permission too -- if revoked, AlarmManager.setAlarmClock() silently degrades to an inexact
    // window (the alarm can fire minutes late) instead of throwing. Below API 31 exact alarms
    // were unconditionally allowed, so there's nothing to check.
    @Command
    fun checkExactAlarmPermission(invoke: Invoke) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }
        val ret = JSObject()
        ret.put("granted", granted)
        invoke.resolve(ret)
    }

    @Command
    fun openExactAlarmSettings(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivity(intent)
        }
        invoke.resolve()
    }

    // Doze/App Standby can defer or throttle the alarm's native wake/ring path if the app isn't
    // exempted from battery optimization, again with nothing surfaced to the user when it
    // happens. Available on every OS version this app supports (minSdk 26), unlike the two
    // checks above.
    @Command
    fun checkBatteryOptimizationExemption(invoke: Invoke) {
        val powerManager = activity.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        val ret = JSObject()
        ret.put("granted", powerManager.isIgnoringBatteryOptimizations(activity.packageName))
        invoke.resolve(ret)
    }

    @Command
    fun openBatteryOptimizationSettings(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${activity.packageName}")
        }
        activity.startActivity(intent)
        invoke.resolve()
    }

    // Ringing-screen navigation is otherwise driven entirely by the notification's full-screen
    // intent (see DeepLinkService.ts) -- if that launch is ever missed (permission denied, OS
    // quirk, or the app is simply reopened from the home-screen icon while an alarm is still
    // ringing), there is no other signal telling the frontend an alarm is active. This exposes
    // AlarmRingingService's own in-memory state so the frontend can route there as a fallback.
    @Command
    fun getCurrentlyRingingAlarm(invoke: Invoke) {
        val ret = JSObject()
        val id = AlarmRingingService.currentlyRingingAlarmId
        ret.put("id", if (id > 0) id else null)
        invoke.resolve(ret)
    }

    @Command
    fun setAlarmEventHandler(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmEventHandlerArgs::class.java)
        alarmEventChannel = args.handler
        Log.d(TAG, "Alarm event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun setSnoozeEventHandler(invoke: Invoke) {
        val args = invoke.parseArgs(SnoozeEventHandlerArgs::class.java)
        snoozeEventChannel = args.handler
        Log.d(TAG, "Snooze event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun setDismissEventHandler(invoke: Invoke) {
        val args = invoke.parseArgs(DismissEventHandlerArgs::class.java)
        dismissEventChannel = args.handler
        Log.d(TAG, "Dismiss event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun setImportEventHandler(invoke: Invoke) {
        val args = invoke.parseArgs(ImportEventHandlerArgs::class.java)
        importEventChannel = args.handler
        Log.d(TAG, "Import event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun markAlarmPipelineReady(invoke: Invoke) {
        alarmPipelineReady = true
        Log.d(TAG, "Alarm pipeline marked ready")
        drainQueuedEvents()
        invoke.resolve()
    }

    @app.tauri.annotation.ActivityCallback
    fun pickAlarmSoundResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val data = result.data
            val uri: Uri? = if (data != null) {
                if (Build.VERSION.SDK_INT >= 33) {
                    data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
                }
            } else null

            val ret = JSObject()

            if (uri != null) {
                ret.put("uri", uri.toString())
                ret.put("isSilent", false)
                // Best effort title
                val ringtone = RingtoneManager.getRingtone(activity, uri)
                val title = ringtone?.getTitle(activity) ?: "Unknown"
                ret.put("title", title)
            } else {
                ret.put("uri", null)
                ret.put("isSilent", true)
                ret.put("title", "Silent")
            }

            invoke.resolve(ret)
        } else {
            invoke.reject("cancelled")
        }
    }

    /** Maps a [DurableEventQueue] topic to the Channel Rust registered to receive it. */
    private fun channelForTopic(topic: String): Channel? = when (topic) {
        TOPIC_FIRED -> alarmEventChannel
        TOPIC_SNOOZE -> snoozeEventChannel
        TOPIC_DISMISS -> dismissEventChannel
        TOPIC_IMPORT -> importEventChannel
        else -> null
    }

    /**
     * Drains every queued event (all topics, chronological arrival order) and dispatches each to the Channel matching its topic. A no-op while [alarmPipelineReady] is `false`.
     *
     * This is the single delivery path to Rust: [notifyAlarmFired] and friends always enqueue first and then call this immediately, so when the pipeline is already up this runs in the very same call rather than as a separate "replay later" pass. The actual drain/topic -> outcome bookkeeping lives in [drainAndDispatch]; this just supplies the Android-side dispatch (Channel lookup + send).
     */
    @Synchronized
    private fun drainQueuedEvents() {
        if (!alarmPipelineReady) return
        val queue = eventQueue(activity)
        val handledCount = drainAndDispatch(queue) { topic, payload ->
            val channel = channelForTopic(topic)
            if (channel == null) {
                Log.w(TAG, "No channel registered for topic '$topic', leaving event queued")
                false
            } else {
                try {
                    channel.send(JSObject(payload))
                    true
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to dispatch queued event (topic '$topic')", e)
                    false
                }
            }
        }
        if (handledCount > 0) {
            Log.i(TAG, "Drained $handledCount queued event(s)")
            NativeEventLog.log(activity, TAG, "Drained $handledCount queued event(s)")
        }
    }
}
