// In-process listener that rings the watch the instant an alarm fires, before Rust boots
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Context
import android.util.Log
import ca.liminalhq.threshold.nativebus.NativeEventBus
import org.json.JSONObject

private const val TAG = "NativeFiredListener"

// Mirrors alarm-manager's own `internal const val TOPIC_FIRED` (AlarmManagerPlugin.kt) --
// duplicated rather than shared because the two plugins are separate Gradle modules and
// this string is frozen by docs/architecture/255-phase3-payload-contract.md, not by a
// shared Kotlin symbol.
internal const val TOPIC_FIRED = "alarm-manager:native-fired"

// Exact string per the #255 Phase 3 payload contract -- also referenced by the Rust-side
// staleness/tag gate in lib.rs's `alarm:fired` listener once Phase 3C's `handled_natively`
// field lands on the app's `AlarmFired` struct.
internal const val TAG_WATCH_RING = "watch-ring"

// Per the #255 Phase 3 payload contract: a fired event older than this is treated as a
// stale replay (e.g. a durable-queue entry drained long after the alarm actually rang) and
// must not ring the watch again. Mirrored independently (no shared source of truth across
// languages) by `STALENESS_WINDOW_MS`/`is_stale` in wear-sync's own `src/lib.rs` -- if you
// tune this value, tune that one too.
internal const val STALENESS_WINDOW_MS = 90_000L

/**
 * Registers with [NativeEventBus] for alarm-manager's `alarm-manager:native-fired` topic and
 * rings the watch directly via Play Services, entirely natively, the moment an alarm fires
 * cold -- no dependency on Rust or the WebView having booted. This is what actually closes
 * issue #254 (the watch staying silent for ~20s on a cold fire while the phone is in active
 * use): [WearRingInitProvider]'s `onCreate()` guarantees this listener is registered before
 * `AlarmReceiver.onReceive()` can run, even on a cold multi-plugin process start.
 *
 * Builds the ring payload entirely from [WearSyncCache] (the last-published alarm snapshot
 * plus snooze/time-format prefs) -- no Rust involvement needed. See [NativeEventBus]'s KDoc
 * for the threading contract this object's [handle] function must honour: it does only
 * cheap, synchronous work inline (parse, staleness check, toggle check) and hands the actual
 * network I/O off to [NativeAlarmSerialExecutor], returning [TAG_WATCH_RING] once that work is
 * *submitted*, not once it's confirmed delivered -- at-least-once semantics, per the contract
 * doc's decision: stamping the tag after confirmation would risk a crash mid-send leaving the
 * watch silent with no fallback, which is the exact failure this whole design exists to
 * prevent.
 *
 * The toggle check specifically has to stay *synchronous* despite that contract, since
 * [handle]'s return value (whether it claims [TAG_WATCH_RING]) has to reflect whether native
 * fan-out is actually disabled -- deferring that decision into the submitted task would mean
 * returning the tag optimistically, which would make the Rust-side gate skip its own ring too
 * and drop the ring entirely whenever the toggle is off. [NativeFanOutPrefs] resolves the
 * tension by caching the toggle's value in memory, warmed once by [WearRingInitProvider.onCreate] before
 * this listener is even registered -- see its KDoc -- so by the time [handle] can possibly
 * run, the "synchronous" check is a plain volatile-field read, not a `SharedPreferences` disk
 * hit.
 */
object NativeFiredListener {

    /** Registers this listener with [NativeEventBus]. Called once from [WearRingInitProvider.onCreate]. */
    fun register(context: Context) {
        NativeListenerSupport.subscribe(context, TAG, TOPIC_FIRED, ::handle)
    }

    /**
     * The [NativeEventBus] listener callback itself. `internal` (not `private`) so tests can
     * drive it directly against a fake/instrumented [Context] without going through
     * [register]/[NativeEventBus].
     */
    internal fun handle(context: Context, payload: String): String? {
        val fired = parseFiredPayload(payload)
        if (fired == null) {
            Log.w(TAG, "Ignoring malformed '$TOPIC_FIRED' payload")
            return null
        }

        if (!NativeFanOutPrefs.isNativeFanOutEnabled(context)) {
            Log.d(TAG, "Native watch fan-out disabled by developer toggle, skipping id=${fired.id}")
            return null
        }

        if (isStale(fired.actualFiredAt, System.currentTimeMillis())) {
            Log.w(TAG, "Ignoring stale fired event for id=${fired.id}, actualFiredAt=${fired.actualFiredAt}")
            return null
        }

        // Submitted through the per-alarm-id serial queue (issue #255 Phase 4B code review),
        // not a plain scope.launch(Dispatchers.IO) -- see NativeAlarmSerialExecutor's KDoc for
        // why routing both this send and NativeStopListener's dismiss/snooze send for the same
        // id through one shared queue is what keeps this one strictly ordered ahead of it.
        NativeAlarmSerialExecutor.submit(fired.id) {
            try {
                ringWatch(context, fired.id)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to ring watch natively for id=${fired.id}", e)
            }
        }
        return TAG_WATCH_RING
    }

    private suspend fun ringWatch(context: Context, alarmId: Int) {
        val cached = WearSyncCache.read(context)
        if (cached == null) {
            Log.w(TAG, "No cached alarm data available, cannot ring watch natively for id=$alarmId")
            return
        }
        val (alarmsJson, _, snoozeLengthMinutes, is24Hour, is24HourKnown) = cached
        val label = resolveAlarmLabel(alarmsJson, alarmId)

        val payload = buildAlarmRingPayload(
            alarmId = alarmId,
            label = label,
            hour = null,
            minute = null,
            snoozeLengthMinutes = snoozeLengthMinutes,
            is24Hour = is24Hour,
            is24HourKnown = is24HourKnown,
        )

        sendWatchMessageToConnectedNodes(context, MSG_PATH_ALARM_RING, payload, TAG, "alarm ring")
    }
}

/** One `alarm-manager:native-fired` payload's fields this listener cares about. */
internal data class FiredPayload(val id: Int, val actualFiredAt: Long)

/**
 * Parses the `{id, actualFiredAt, ...}` JSON payload alarm-manager publishes to
 * [NativeEventBus] (see docs/architecture/255-phase3-payload-contract.md). Tolerates and
 * ignores the payload's `eventId`/`handledNatively` fields -- this listener has no use for
 * either. Returns `null` for anything malformed or missing a usable `id`/`actualFiredAt`
 * rather than throwing, so a corrupt payload is silently skipped (logged by the caller)
 * instead of crashing [NativeEventBus.publish]'s caller.
 */
internal fun parseFiredPayload(payload: String): FiredPayload? {
    return try {
        val json = JSONObject(payload)
        val id = json.optInt("id", -1)
        if (id <= 0) return null
        val actualFiredAt = json.optLong("actualFiredAt", -1L)
        if (actualFiredAt <= 0L) return null
        FiredPayload(id, actualFiredAt)
    } catch (e: Exception) {
        null
    }
}

/**
 * Whether a fired event timestamped [actualFiredAt] is too old, relative to [now], to still
 * ring the watch -- per the #255 Phase 3 payload contract's [STALENESS_WINDOW_MS] window. A
 * pure function of two timestamps so it's unit-testable without any Android framework class.
 */
internal fun isStale(actualFiredAt: Long, now: Long, windowMs: Long = STALENESS_WINDOW_MS): Boolean {
    return now - actualFiredAt > windowMs
}

/**
 * Looks up alarm [alarmId]'s label inside [alarmsJson] -- the cached `SyncResponse` FullSync
 * envelope JSON written by [WearSyncCache.write] (`{"type":"FullSync","currentRevision":…,
 * "allAlarms":[{"id":…,"label":…},…]}`, see wear-sync's Rust `sync_protocol::SyncResponse`).
 * Returns `""` (matching `AlarmRingRequest.label`'s own default) if the envelope is
 * malformed, isn't a `FullSync`, or has no alarm with a matching id -- a missing label
 * shouldn't stop the watch from ringing.
 *
 * A pure function of the raw cached JSON string, not [WearSyncCache] itself, so it's
 * unit-testable without an Android [Context].
 */
internal fun resolveAlarmLabel(alarmsJson: String, alarmId: Int): String {
    return try {
        val root = JSONObject(alarmsJson)
        val allAlarms = root.optJSONArray("allAlarms") ?: return ""
        for (i in 0 until allAlarms.length()) {
            val alarm = allAlarms.optJSONObject(i) ?: continue
            if (alarm.optInt("id", -1) == alarmId) {
                return alarm.optString("label", "")
            }
        }
        ""
    } catch (e: Exception) {
        ""
    }
}
