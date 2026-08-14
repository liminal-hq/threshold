// In-process listener that stops the watch ringing the instant dismiss/snooze happens on the phone, before Rust boots
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Context
import android.util.Log
import ca.liminalhq.threshold.nativebus.NativeEventBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val TAG = "NativeStopListener"

// Mirrors alarm-manager's own topic constants for its phone-notification Dismiss/Snooze
// actions (issue #255 Phase 4A, alarm-manager's own init ContentProvider) -- duplicated
// rather than shared for the same reason NativeFiredListener's TOPIC_FIRED is duplicated: the
// two plugins are separate Gradle modules with no shared Kotlin symbol between them.
internal const val TOPIC_DISMISS_REQUESTED = "alarm-manager:dismiss-requested"
internal const val TOPIC_SNOOZE_REQUESTED = "alarm-manager:snooze-requested"

// Fallback used only when no cached snooze length is available (see handleSnooze) -- matches
// AlarmSnoozeRequest.snoozeLengthMinutes's own default in WearSyncPlugin.kt.
private const val DEFAULT_SNOOZE_LENGTH_MINUTES = 10

/**
 * Registers with [NativeEventBus] for alarm-manager's `alarm-manager:dismiss-requested` and
 * `alarm-manager:snooze-requested` topics and sends the corresponding stop message to every
 * connected watch node directly via Play Services, entirely natively -- no dependency on Rust
 * or the WebView having booted. This is issue #255 Phase 4B's "phone notification while cold"
 * half of symmetric stop signals: the counterpart to [NativeFiredListener], but for the
 * dismiss/snooze-stops-the-watch direction rather than fired-starts-the-watch.
 * [WearRingInitProvider]'s `onCreate()` registers this listener the same way it registers
 * [NativeFiredListener], so it is live before `AlarmRingingService`'s own notification
 * Dismiss/Snooze actions can post through alarm-manager's channel.
 *
 * Unlike [NativeFiredListener], this listener claims no tag on [NativeEventBus.publish] and
 * applies no staleness/dedup gate: per issue #255's design decision 4, a double-delivered
 * *stop* signal is benign (the watch already safely no-ops a dismiss/snooze for an alarm it
 * isn't actively ringing), so there is no failure mode here symmetric to the fired path's
 * "ring the watch twice" that a tag would need to guard against.
 *
 * Builds the outgoing message from alarm-manager's `{id}` payload plus, for snooze,
 * [WearSyncCache]'s cached `snoozeLengthMinutes` (the bus payload itself doesn't carry it), and
 * sends it with [sendWatchMessageToConnectedNodes] -- the same shared Play Services send-loop
 * [NativeFiredListener] and [WearSyncPlugin.sendAlarmRing] already use, not a third hand-rolled
 * copy of the "iterate connected nodes, send message" loop.
 */
object NativeStopListener {

    // A dedicated scope, not WearSyncPlugin's -- same reasoning as NativeFiredListener's: this
    // listener can run (and does run, by design) before any WearSyncPlugin instance exists.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Registers this listener with [NativeEventBus]. Called once from [WearRingInitProvider.onCreate]. */
    fun register(context: Context) {
        val appContext = context.applicationContext
        NativeEventBus.subscribe(TOPIC_DISMISS_REQUESTED) { payload -> handleDismiss(appContext, payload) }
        NativeEventBus.subscribe(TOPIC_SNOOZE_REQUESTED) { payload -> handleSnooze(appContext, payload) }
        Log.d(
            TAG,
            "Registered native stop listener for topics '$TOPIC_DISMISS_REQUESTED', '$TOPIC_SNOOZE_REQUESTED'",
        )
    }

    /**
     * The [NativeEventBus] listener callback for [TOPIC_DISMISS_REQUESTED]. `internal` (not
     * `private`) so tests can drive it directly, mirroring [NativeFiredListener.handle].
     */
    internal fun handleDismiss(context: Context, payload: String): String? {
        val alarmId = parseIdPayload(payload)
        if (alarmId == null) {
            Log.w(TAG, "Ignoring malformed '$TOPIC_DISMISS_REQUESTED' payload")
            return null
        }

        scope.launch {
            try {
                val messagePayload = buildAlarmDismissPayload(alarmId)
                sendWatchMessageToConnectedNodes(context, MSG_PATH_ALARM_DISMISS, messagePayload, TAG, "alarm dismiss")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send dismiss to watch natively for id=$alarmId", e)
            }
        }
        return null
    }

    /**
     * The [NativeEventBus] listener callback for [TOPIC_SNOOZE_REQUESTED]. `internal` (not
     * `private`) so tests can drive it directly, mirroring [NativeFiredListener.handle].
     */
    internal fun handleSnooze(context: Context, payload: String): String? {
        val alarmId = parseIdPayload(payload)
        if (alarmId == null) {
            Log.w(TAG, "Ignoring malformed '$TOPIC_SNOOZE_REQUESTED' payload")
            return null
        }

        scope.launch {
            try {
                val cached = WearSyncCache.read(context)
                val snoozeLengthMinutes = cached?.third ?: DEFAULT_SNOOZE_LENGTH_MINUTES
                val messagePayload = buildAlarmSnoozePayload(alarmId, snoozeLengthMinutes)
                sendWatchMessageToConnectedNodes(context, MSG_PATH_ALARM_SNOOZE, messagePayload, TAG, "alarm snooze")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send snooze to watch natively for id=$alarmId", e)
            }
        }
        return null
    }
}

/**
 * Parses the `{id}` JSON payload alarm-manager publishes to [NativeEventBus] for both
 * [TOPIC_DISMISS_REQUESTED] and [TOPIC_SNOOZE_REQUESTED] (see [NativeStopListener]'s KDoc).
 * Returns `null` for anything malformed or missing a usable positive `id`, mirroring
 * [parseFiredPayload]'s tolerance -- a corrupt payload is silently skipped (logged by the
 * caller) rather than crashing [NativeEventBus.publish]'s caller.
 *
 * A pure function of the raw payload string so it's unit-testable without any Android
 * framework class, same as [parseFiredPayload].
 */
internal fun parseIdPayload(payload: String): Int? {
    return try {
        val json = JSONObject(payload)
        val id = json.optInt("id", -1)
        if (id <= 0) null else id
    } catch (e: Exception) {
        null
    }
}
