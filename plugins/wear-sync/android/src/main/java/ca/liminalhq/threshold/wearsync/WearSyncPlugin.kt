// Tauri plugin — publishes alarm data to watch via Wear Data Layer and receives watch messages
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.app.Activity
import android.content.Context
import android.util.Log
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.NodeClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

private const val TAG = "WearSyncPlugin"
private const val DATA_PATH_ALARMS = "/threshold/alarms"
private const val MSG_PATH_SYNC_REQUEST = "/threshold/sync_request"
// internal (not private) -- shared with NativeFiredListener, which sends the same
// alarm_ring message from outside this Activity-bound plugin instance.
internal const val MSG_PATH_ALARM_RING = "/threshold/alarm_ring"
// internal (not private) -- shared with NativeStopListener (issue #255 Phase 4B), which
// sends the same dismiss/snooze messages from outside this Activity-bound plugin instance.
internal const val MSG_PATH_ALARM_DISMISS = "/threshold/alarm_dismiss"
internal const val MSG_PATH_ALARM_SNOOZE = "/threshold/alarm_snooze"
private const val MSG_PATH_LOG_REQUEST = "/threshold/log_request"
private const val EXTRA_HEADLESS_BOOT = "wear_sync_headless_boot"

/**
 * Builds the JSON alarm-ring message payload sent to the watch over `MessageClient` at
 * [MSG_PATH_ALARM_RING]. Shared by [WearSyncPlugin.sendAlarmRing] (the Rust-invoked path,
 * used once Rust/WebView has booted) and [NativeFiredListener] (the in-process native path,
 * issue #255 Phase 3B) so the wire format is defined in exactly one place.
 *
 * `hour`/`minute` of `null` means "use the device's current time" -- both callers already
 * pass `null` today (Rust never supplies an explicit time; the native path has no reason to
 * either), but the parameter is kept so a future caller with a real scheduled time can still
 * use this helper.
 */
internal fun buildAlarmRingPayload(
    alarmId: Int,
    label: String,
    hour: Int?,
    minute: Int?,
    snoozeLengthMinutes: Int,
    is24Hour: Boolean,
    is24HourKnown: Boolean,
): ByteArray {
    val cal = java.util.Calendar.getInstance()
    val resolvedHour = hour ?: cal.get(java.util.Calendar.HOUR_OF_DAY)
    val resolvedMinute = minute ?: cal.get(java.util.Calendar.MINUTE)

    val json = JSONObject().apply {
        put("alarmId", alarmId)
        put("label", label)
        put("hour", resolvedHour)
        put("minute", resolvedMinute)
        put("snoozeLengthMinutes", snoozeLengthMinutes)
        put("is24Hour", is24Hour)
        put("is24HourKnown", is24HourKnown)
    }
    return json.toString().toByteArray()
}

/**
 * Sends [payload] to every currently connected watch node at [path], logging both to Logcat
 * and [NativeEventLog] under [tag] (the caller's own tag, so diagnostics from the Rust-invoked
 * path and each native path are still distinguishable) and [logLabel] (a short human-readable
 * description of the message, e.g. `"alarm ring"`/`"alarm dismiss"`/`"alarm snooze"`, used only
 * in those log lines).
 *
 * Originally specific to [MSG_PATH_ALARM_RING] (issue #255 Phase 3B, shared by
 * [WearSyncPlugin.sendAlarmRing] and [NativeFiredListener] alongside [buildAlarmRingPayload] so
 * the two callers' "iterate connected nodes, send message" logic couldn't drift the way it
 * already had once -- only one of them was logging to [NativeEventLog]). Generalised to take an
 * arbitrary [path] in Phase 4B so [NativeStopListener]'s dismiss/snooze sends reuse this same
 * loop instead of hand-rolling a third copy of it.
 *
 * [nodeClient]/[messageClient] default to fresh `Wearable.get*Client(context)` instances --
 * the right choice for [NativeFiredListener]/[NativeStopListener], which run before any
 * [WearSyncPlugin] instance (and its cached clients) exists. [WearSyncPlugin]'s own callers
 * pass its `by lazy` cached clients explicitly instead (issue #255 Phase 4B code review):
 * dismiss/snooze/ring are commands invoked from the WebView on every alarm interaction, a hot
 * enough path that constructing a fresh `NodeClient`/`MessageClient` per call -- rather than
 * reusing the ones the plugin already holds for exactly this purpose -- is wasteful.
 *
 * Returns the number of nodes the message was actually sent to (`0` if none connected --
 * the existing "no watch paired" gap noted on [WearSyncPlugin.sendAlarmRing], not something
 * any caller treats as an error).
 */
internal suspend fun sendWatchMessageToConnectedNodes(
    context: Context,
    path: String,
    payload: ByteArray,
    tag: String,
    logLabel: String,
    nodeClient: NodeClient = Wearable.getNodeClient(context),
    messageClient: MessageClient = Wearable.getMessageClient(context),
): Int {
    val nodes = nodeClient.connectedNodes.await()
    if (nodes.isEmpty()) {
        Log.d(tag, "No connected watch nodes — skipping $logLabel notification")
        return 0
    }

    for (node in nodes) {
        messageClient.sendMessage(node.id, path, payload).await()
        Log.d(tag, "Sent $logLabel to watch: ${node.displayName}")
    }
    NativeEventLog.log(context, tag, "Sent $logLabel to ${nodes.size} node(s)")
    return nodes.size
}

/**
 * Builds the JSON alarm-dismiss message payload sent to the watch over `MessageClient` at
 * [MSG_PATH_ALARM_DISMISS]. Shared by [WearSyncPlugin.sendAlarmDismiss] (the Rust-invoked path)
 * and [NativeStopListener] (the in-process native path, issue #255 Phase 4B) so the wire format
 * is defined in exactly one place, mirroring [buildAlarmRingPayload]'s existing precedent.
 */
internal fun buildAlarmDismissPayload(alarmId: Int): ByteArray {
    val json = JSONObject().apply {
        put("alarmId", alarmId)
    }
    return json.toString().toByteArray()
}

/**
 * Builds the JSON alarm-snooze message payload sent to the watch over `MessageClient` at
 * [MSG_PATH_ALARM_SNOOZE]. Shared by [WearSyncPlugin.sendAlarmSnooze] (the Rust-invoked path)
 * and [NativeStopListener] (the in-process native path, issue #255 Phase 4B) so the wire format
 * is defined in exactly one place, mirroring [buildAlarmRingPayload]'s existing precedent.
 */
internal fun buildAlarmSnoozePayload(alarmId: Int, snoozeLengthMinutes: Int): ByteArray {
    val json = JSONObject().apply {
        put("alarmId", alarmId)
        put("snoozeLengthMinutes", snoozeLengthMinutes)
    }
    return json.toString().toByteArray()
}

/**
 * The peek -> deliver-each-via-[deliver] -> commit-only-what-was-delivered sequence
 * [WearSyncPlugin.drainQueuedMessages] performs, factored out into its own small class (issue
 * #255 Phase 4B code review, PR #300 finding) so it's unit-testable -- proving two overlapping
 * [drain] calls don't both observe and redeliver the same uncommitted batch -- without a live
 * `Activity`/`Channel`/Play Services instance, which [WearSyncPlugin] itself needs to
 * construct.
 *
 * [WearSyncEventQueue.peekAll]/[WearSyncEventQueue.commit] are each individually
 * `@Synchronized` on their own underlying `DurableEventQueue`, but that only protects each
 * individual call, not the sequence between them -- the lock is released between peek and
 * commit. [WearSyncPlugin] calls [drain] from three independent, differently-threaded call
 * sites ([WearSyncPlugin.onWatchMessage], plus the `setWatchMessageHandler`/
 * `markWatchPipelineReady` Tauri commands during app boot) with no mutual exclusion between
 * them otherwise, so two overlapping calls could each peek the same uncommitted batch and
 * redeliver every message in it to Rust before either commits -- `commit()` itself is
 * idempotent, so the persisted queue would stay consistent, but Rust would still receive
 * genuine duplicate deliveries, which can re-anchor a snooze or double-process a dismiss (not
 * every `AlarmCoordinator` handler is idempotent against a resend).
 *
 * `@Synchronized` on [drain] (locking on this [QueueDrainer] instance) closes that gap: a
 * second overlapping call blocks until the first's peek-deliver-commit sequence has fully
 * finished. [WearSyncPlugin] holds exactly one [QueueDrainer] per plugin instance (see its
 * `queueDrainer` field), so every call site synchronizes on the same monitor.
 *
 * Deliberately peek-then-commit-after-delivery, not drain-then-deliver: if [deliver] throws
 * partway through a batch (a stale Channel reference, a JNI failure, whatever), every message
 * not yet delivered at that point must still be in the queue afterwards so it's retried on the
 * next drain, not silently lost.
 */
internal class QueueDrainer(private val queue: WearSyncEventQueue) {

    @Synchronized
    fun drain(deliver: (WearSyncEventQueue.QueuedMessage) -> Unit) {
        val pending = queue.peekAll()
        if (pending.isEmpty()) return

        Log.i(TAG, "Replaying ${pending.size} queued message(s)")
        val delivered = mutableSetOf<String>()
        try {
            for (message in pending) {
                deliver(message)
                delivered.add(message.eventId)
            }
        } finally {
            queue.commit(delivered)
        }
    }
}

@InvokeArg
class PublishRequest {
    var alarmsJson: String = ""
    var revision: Long = 0
    var snoozeLengthMinutes: Int = 10
    var is24Hour: Boolean = false
    var is24HourKnown: Boolean = false
}

@InvokeArg
class SyncRequest {
    var revision: Long = 0
}

@InvokeArg
class AlarmRingRequest {
    var alarmId: Int = -1
    var label: String = ""
    // Null means "use the device's current time"; the Rust side omits the
    // key entirely rather than sending JSON null (see AlarmRingRequest in
    // wear-sync's models.rs).
    var hour: Int? = null
    var minute: Int? = null
    var snoozeLengthMinutes: Int = DEFAULT_SNOOZE_LENGTH_MINUTES
    var is24Hour: Boolean = false
    var is24HourKnown: Boolean = false
}

@InvokeArg
class AlarmDismissRequest {
    var alarmId: Int = -1
}

@InvokeArg
class AlarmSnoozeRequest {
    var alarmId: Int = -1
    var snoozeLengthMinutes: Int = DEFAULT_SNOOZE_LENGTH_MINUTES
}

@InvokeArg
class WatchMessageHandlerArgs {
    lateinit var handler: Channel
}

@InvokeArg
class SetNativeFanOutEnabledArgs {
    var enabled: Boolean = true
}

@TauriPlugin
class WearSyncPlugin(private val activity: Activity) : Plugin(activity) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val dataClient by lazy { Wearable.getDataClient(activity) }
    private val messageClient by lazy { Wearable.getMessageClient(activity) }
    private val nodeClient by lazy { Wearable.getNodeClient(activity) }
    // Must go through the process-wide singleton, not a fresh instance -- see WearSyncEventQueue.getInstance's KDoc for why a second, independently-constructed instance over the same SharedPreferences file provides no mutual exclusion against this one, or against WearMessageService's own offline-write enqueues.
    private val watchQueue by lazy { WearSyncEventQueue.getInstance(activity) }
    // One drainer per plugin instance, reused by every drainQueuedMessages() call site -- see
    // QueueDrainer's own KDoc for why this is what actually closes the overlapping-drain race
    // (issue #255 Phase 4B code review, PR #300 finding).
    private val queueDrainer by lazy { QueueDrainer(watchQueue) }
    private var watchMessageChannel: Channel? = null
    @Volatile
    private var watchPipelineReady: Boolean = false

    override fun load(webView: WebView) {
        super.load(webView)
        instance = this
        Log.d(TAG, "Initialised wear-sync plugin")

        // If the activity was launched for a wear-sync cold boot, push it to
        // the background as early as possible to minimise visible flashing.
        if (activity.intent?.getBooleanExtra(EXTRA_HEADLESS_BOOT, false) == true) {
            moveActivityToBack()
        }
    }

    /**
     * Publish alarm data to the connected watch via the Wear Data Layer.
     *
     * Receives serialised alarm JSON and the current revision from the Rust
     * side, writes it to a DataItem at [DATA_PATH_ALARMS] so the watch
     * receives it through its `WearableListenerService`.
     */
    @Command
    fun publishToWatch(invoke: Invoke) {
        val args = invoke.parseArgs(PublishRequest::class.java)
        scope.launch {
            try {
                val request = PutDataMapRequest.create(DATA_PATH_ALARMS).apply {
                    dataMap.putString("alarmsJson", args.alarmsJson)
                    dataMap.putLong("revision", args.revision)
                    dataMap.putLong("timestamp", System.currentTimeMillis())
                    dataMap.putInt("snoozeLengthMinutes", args.snoozeLengthMinutes)
                    dataMap.putBoolean("is24Hour", args.is24Hour)
                    dataMap.putBoolean("is24HourKnown", args.is24HourKnown)
                }
                request.setUrgent()

                val dataItem = dataClient.putDataItem(request.asPutDataRequest()).await()
                Log.d(TAG, "Published to watch: uri=${dataItem.uri}, revision=${args.revision}, snooze=${args.snoozeLengthMinutes}m, is24h=${args.is24Hour}, is24hKnown=${args.is24HourKnown}")

                // Cache for offline sync (WearMessageService reads this when plugin isn't loaded)
                WearSyncCache.write(
                    activity,
                    args.alarmsJson,
                    args.revision,
                    args.snoozeLengthMinutes,
                    args.is24Hour,
                    args.is24HourKnown,
                )

                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to publish to watch", e)
                invoke.reject("Failed to publish to watch: ${e.message}")
            }
        }
    }

    /**
     * Send a sync request message to all connected watch nodes.
     *
     * Uses `MessageClient` to send a lightweight message to each connected
     * node, prompting them to request a full or incremental sync.
     */
    @Command
    fun requestSyncFromWatch(invoke: Invoke) {
        val args = invoke.parseArgs(SyncRequest::class.java)
        scope.launch {
            try {
                val nodes = nodeClient.connectedNodes.await()
                Log.d(TAG, "Sending sync request to ${nodes.size} node(s) at revision ${args.revision}")

                for (node in nodes) {
                    val payload = args.revision.toString().toByteArray()
                    messageClient.sendMessage(node.id, MSG_PATH_SYNC_REQUEST, payload).await()
                    Log.d(TAG, "Sent sync request to node ${node.displayName} (${node.id})")
                }
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send sync request", e)
                invoke.reject("Failed to send sync request: ${e.message}")
            }
        }
    }

    /**
     * Send an alarm ring message to all connected watch nodes.
     *
     * Called from the Rust side when an alarm fires. The watch receives
     * this message via its [DataLayerListenerService] and starts its
     * own [WearRingingService] to show the ringing UI and vibrate.
     *
     * Known gap (issue #255): this resolves successfully without ever sending a message
     * when no watch node is currently connected -- that's a distinct, out-of-scope gap
     * (watch not paired/connected) from the one Phase 3B's native fan-out
     * ([NativeFiredListener]) closes (Rust/WebView not booted yet).
     */
    @Command
    fun sendAlarmRing(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmRingRequest::class.java)
        scope.launch {
            try {
                val payload = buildAlarmRingPayload(
                    alarmId = args.alarmId,
                    label = args.label,
                    hour = args.hour,
                    minute = args.minute,
                    snoozeLengthMinutes = args.snoozeLengthMinutes,
                    is24Hour = args.is24Hour,
                    is24HourKnown = args.is24HourKnown,
                )
                sendWatchMessageToConnectedNodes(activity, MSG_PATH_ALARM_RING, payload, TAG, "alarm ring", nodeClient, messageClient)
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send alarm ring to watch", e)
                invoke.reject("Failed to send alarm ring: ${e.message}")
            }
        }
    }

    /**
     * Send an alarm dismiss message to all connected watch nodes.
     *
     * Called from the Rust side when an alarm is dismissed on phone so
     * active watch ringing can stop immediately.
     */
    @Command
    fun sendAlarmDismiss(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmDismissRequest::class.java)
        scope.launch {
            try {
                val payload = buildAlarmDismissPayload(args.alarmId)
                sendWatchMessageToConnectedNodes(activity, MSG_PATH_ALARM_DISMISS, payload, TAG, "alarm dismiss", nodeClient, messageClient)
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send alarm dismiss to watch", e)
                invoke.reject("Failed to send alarm dismiss: ${e.message}")
            }
        }
    }

    /**
     * Send an alarm snooze message to all connected watch nodes.
     *
     * Called from the Rust side when an alarm is snoozed on phone so
     * active watch ringing can stop immediately.
     */
    @Command
    fun sendAlarmSnooze(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmSnoozeRequest::class.java)
        scope.launch {
            try {
                val payload = buildAlarmSnoozePayload(args.alarmId, args.snoozeLengthMinutes)
                sendWatchMessageToConnectedNodes(activity, MSG_PATH_ALARM_SNOOZE, payload, TAG, "alarm snooze", nodeClient, messageClient)
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send alarm snooze to watch", e)
                invoke.reject("Failed to send alarm snooze: ${e.message}")
            }
        }
    }

    /**
     * Ask connected watch nodes to send their own native event log back, so it
     * can be merged into the phone's "Export event log" feature. Fire-and-forget
     * as far as the watch's actual reply goes: resolves once the request is sent
     * (or immediately if there's no node to send it to), doesn't wait for a reply
     * -- the watch's response (if any) arrives later via [WearMessageService] on
     * its own MSG_PATH_LOG_RESPONSE path and is written straight to the log
     * directory.
     *
     * Resolves with `{"connected": Boolean}` so the Rust side can tell "no watch
     * paired at all" apart from "request sent, might still be waiting on a reply"
     * -- the caller only needs to wait out its bounded window in the latter case.
     */
    @Command
    fun requestWatchLogs(invoke: Invoke) {
        scope.launch {
            try {
                val nodes = nodeClient.connectedNodes.await()
                if (nodes.isEmpty()) {
                    Log.d(TAG, "No connected watch nodes — skipping log request")
                    invoke.resolve(JSObject().apply { put("connected", false) })
                    return@launch
                }

                for (node in nodes) {
                    messageClient.sendMessage(node.id, MSG_PATH_LOG_REQUEST, ByteArray(0)).await()
                    Log.d(TAG, "Requested watch logs from ${node.displayName}")
                }
                invoke.resolve(JSObject().apply { put("connected", true) })
            } catch (e: Exception) {
                Log.e(TAG, "Failed to request watch logs", e)
                invoke.reject("Failed to request watch logs: ${e.message}")
            }
        }
    }

    /**
     * Register a [Channel] for sending watch messages from Kotlin back to Rust.
     *
     * Called by the Rust plugin setup via `run_mobile_plugin("set_watch_message_handler", ...)`.
     * The channel is backed by JNI so data flows directly Kotlin → Rust without
     * going through the WebView/JS layer.
     */
    @Command
    fun setWatchMessageHandler(invoke: Invoke) {
        val args = invoke.parseArgs(WatchMessageHandlerArgs::class.java)
        watchMessageChannel = args.handler
        Log.d(TAG, "Watch message handler channel registered")
        drainQueuedMessages()

        invoke.resolve()
    }

    /**
     * Mark the watch message pipeline as ready and drain queued messages.
     *
     * Called by Rust after the app crate has registered watch event listeners.
     */
    @Command
    fun markWatchPipelineReady(invoke: Invoke) {
        watchPipelineReady = true
        Log.d(TAG, "Watch pipeline marked ready")
        drainQueuedMessages()
        invoke.resolve()
    }

    /**
     * Developer toggle (issue #255 Phase 3B): enable or disable [NativeFiredListener]'s
     * in-process fired→watch-ring fan-out, so a tester can exercise the Rust
     * `alarm:fired` → `send_alarm_ring` path in isolation. Persisted via
     * [NativeFanOutPrefs] so it survives process death (the whole point of the native path
     * is that it can run before this plugin instance even exists).
     */
    @Command
    fun setNativeFanOutEnabled(invoke: Invoke) {
        val args = invoke.parseArgs(SetNativeFanOutEnabledArgs::class.java)
        NativeFanOutPrefs.setNativeFanOutEnabled(activity, args.enabled)
        Log.d(TAG, "Native watch fan-out enabled=${args.enabled}")
        invoke.resolve()
    }

    /** Reads the current value of the [setNativeFanOutEnabled] toggle. Defaults to `true`. */
    @Command
    fun getNativeFanOutEnabled(invoke: Invoke) {
        val enabled = NativeFanOutPrefs.isNativeFanOutEnabled(activity)
        invoke.resolve(JSObject().apply { put("enabled", enabled) })
    }

    /**
     * Move the host activity to the back of the task stack.
     *
     * Called by [WearSyncService] after cold-booting the Tauri runtime so
     * the user doesn't see the app flash to the foreground.
     */
    fun moveActivityToBack() {
        activity.runOnUiThread {
            val moved = activity.moveTaskToBack(true)
            Log.d(TAG, "moveTaskToBack result: $moved")
            NativeEventLog.log(activity, TAG, "moveActivityToBack called, moveTaskToBack result=$moved")
        }
    }

    /**
     * Called by [WearMessageService] when a message arrives from the watch.
     *
     * Always enqueues onto [watchQueue] first, then immediately drains if the pipeline is ready -- "immediate dispatch" is just "enqueue, then drain right away" rather than a separate code path, so there is exactly one way a message ever reaches Rust: through [drainQueuedMessages]. Sends the message to Rust via the [Channel] registered by [set_watch_message_handler]; the Rust side receives the data directly through JNI without involving the WebView.
     */
    fun onWatchMessage(path: String, data: String) {
        watchQueue.enqueue(path, data)
        if (watchPipelineReady) {
            drainQueuedMessages()
        } else {
            Log.i(TAG, "Watch pipeline not ready, queued message: path=$path")
        }
    }

    /**
     * Peeks every queued message and delivers each one to Rust in turn, committing (removing) only the ones that were actually handed to the [Channel] successfully.
     *
     * Delegates the actual peek-deliver-commit sequence, and the mutual exclusion around it, to [queueDrainer] -- see [QueueDrainer]'s own KDoc for why a bare per-call `peekAll()`/`commit()` pair isn't enough on its own to stop two overlapping calls (this method is invoked from three independent, differently-threaded call sites: [onWatchMessage], and the [setWatchMessageHandler]/[markWatchPipelineReady] Tauri commands during app boot) from both redelivering the same uncommitted batch to Rust.
     */
    private fun drainQueuedMessages() {
        if (!watchPipelineReady) return
        val channel = watchMessageChannel
        if (channel == null) {
            Log.w(TAG, "Watch pipeline ready but channel not registered yet, message(s) remain queued")
            return
        }

        queueDrainer.drain { message ->
            val event = JSObject()
            event.put("path", message.path)
            event.put("data", message.data)
            // Stamped in so a same-process dedup pass on the Rust side (issue #255 Phase
            // 3C) has something to key watch-originated dismiss/snooze messages on, same
            // as the fired path's eventId -- see WatchMessage::event_id on the Rust side.
            event.put("eventId", message.eventId)
            channel.send(event)
            Log.d(TAG, "Sent watch message to Rust channel: path=${message.path}")
        }
    }

    /** Whether the Kotlin→Rust Channel has been registered and is ready. */
    val isChannelReady: Boolean get() = watchMessageChannel != null

    /**
     * Whether Rust has finished booting, registered its own watch-event listeners, and called
     * [markWatchPipelineReady] -- distinct from [isChannelReady], which only reflects that
     * [setWatchMessageHandler] has registered the Kotlin→Rust [Channel], a step that can (and
     * normally does) happen first. [WearMessageService] checks this, not just whether `instance`
     * is non-null, to decide whether a watch-originated dismiss/snooze still needs the
     * [NativeEventBus] stop signal: [load] sets `instance` well before Rust finishes booting and
     * calls [markWatchPipelineReady], so gating on instance existence alone left that whole
     * window unable to reach `WatchStopListener` (issue #255 Phase 4B code review).
     */
    val isPipelineReady: Boolean get() = watchPipelineReady

    companion object {
        /**
         * Static reference for [WearMessageService] to call back into the
         * plugin. Set during [load] and cleared implicitly by GC if the
         * plugin is unloaded.
         */
        @Volatile
        var instance: WearSyncPlugin? = null
            private set
    }
}
