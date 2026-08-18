// In-process listener that stops the local ringing service the instant the watch dismisses/snoozes, before Rust boots
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.content.Context
import android.content.Intent
import android.util.Log
import ca.liminalhq.threshold.nativebus.NativeEventBus
import org.json.JSONObject

private const val TAG = "WatchStopListener"

// Mirrors the Tauri event names wear-sync's Rust core already emits for these watch-originated commands (`wear:alarm:dismiss`/`wear:alarm:snooze` in apps/threshold/src-tauri/src/lib.rs) -- reused as NativeEventBus topics for the same reason AlarmManagerPlugin's own TOPIC_* constants reuse their Tauri event names: the log/bus contents stay self-describing. Publishing onto these topics is wear-sync's own responsibility (a sibling worktree, issue #255 Phase 4B) -- this file only subscribes.
internal const val TOPIC_WEAR_DISMISS = "wear:alarm:dismiss"
internal const val TOPIC_WEAR_SNOOZE = "wear:alarm:snooze"

// Reported by handle() when it actually stopped AlarmRingingService, mirroring wear-sync's NativeFiredListener.TAG_WATCH_RING -- not consumed by anything today (unlike TAG_WATCH_RING, which Rust's handled_natively gate reads), but kept for the same reason: a non-null NativeEventBus tag documents "something handled this" for anyone inspecting logs.
internal const val TAG_RINGING_STOPPED = "ringing-stopped"

/**
 * Registers with [NativeEventBus] for wear-sync's `wear:alarm:dismiss`/`wear:alarm:snooze` topics and stops [AlarmRingingService] directly the moment the watch dismisses or snoozes a ringing alarm -- entirely natively, no dependency on Rust or the WebView having booted. This is the phone-side half of issue #255 Phase 4A's "symmetric stop signals": the watch can now silence the phone's ringing just as fast as the phone can silence the watch's (Phase 3's fired-fan-out). [WatchStopInitProvider]'s `onCreate()` guarantees this listener is registered before any other component can run, even on a cold multi-plugin process start -- mirrors wear-sync's own [WearRingInitProvider]/`NativeFiredListener` pair from Phase 3B (see that pair's KDoc for the identical `ContentProvider.onCreate()`-always-runs-first reasoning).
 *
 * Deliberately does **not** durably enqueue anything of its own, or call [AlarmManagerPlugin.notifyAlarmDismissed]/`notifySnoozeRequested` -- those would produce a *second*, redundant `alarm-manager:dismiss-requested`/`snooze-requested` event for something that originated on the watch, not the phone. Rust's own catch-up for a watch-originated dismiss/snooze is already durably queued by wear-sync's existing offline-write path (`WearMessageService.handleOfflineWrite` -> `WearSyncEventQueue` -> `WearSyncService` booting Tauri) independent of this listener; this listener's only job is the physical, local "silence the audio/vibration/notification right now" side effect, which per issue #255's design (decision 3) is legal without BAL (background-activity-launch) concerns while the process is in `FOREGROUND_SERVICE` state, i.e. while [AlarmRingingService] is actually running -- the same reasoning Phase 0's spike and Phase 3B already proved out for the opposite direction.
 *
 * [Context.stopService] (not another `ACTION_DISMISS`/`ACTION_SNOOZE` intent) is what actually stops [AlarmRingingService] here -- routing through `ACTION_DISMISS` again would call back into [AlarmManagerPlugin.notifyAlarmDismissed], durably re-queuing an event for something that's already on its way to Rust via wear-sync's own path. `stopService` goes straight to `onDestroy()` (no `onStartCommand`), which is exactly the "just silence it" side effect this listener needs.
 */
object WatchStopListener {

    /** Registers this listener with [NativeEventBus]. Called once from [WatchStopInitProvider.onCreate]. */
    fun register(context: Context) {
        val appContext = context.applicationContext
        NativeEventBus.subscribe(TOPIC_WEAR_DISMISS) { payload -> handle(appContext, payload) }
        NativeEventBus.subscribe(TOPIC_WEAR_SNOOZE) { payload -> handle(appContext, payload) }
        Log.d(TAG, "Registered watch stop listener for topics '$TOPIC_WEAR_DISMISS'/'$TOPIC_WEAR_SNOOZE'")
    }

    /**
     * The [NativeEventBus] listener callback itself. `internal` (not `private`) so tests can drive it directly against a fake [Context] without going through [register]/[NativeEventBus]. Shared by both topics: dismiss and snooze both reduce to the same physical action here (stop the local ringing) -- the DB-level distinction (dismissed vs. re-armed) is Rust's job via wear-sync's own queued path, explicitly out of scope for this listener (issue #255 Phase 4A: "Snooze's re-arm still requires Rust and stays queued").
     */
    internal fun handle(context: Context, payload: String): String? {
        val alarmId = shouldStopForWatchSignal(payload, AlarmRingingService.currentlyRingingAlarmId)
        if (alarmId == null) {
            Log.d(TAG, "Ignoring watch-originated stop signal (malformed payload, or id doesn't match the currently-ringing alarm)")
            return null
        }

        Log.d(TAG, "Stopping AlarmRingingService natively for id=$alarmId (watch-originated stop)")
        NativeEventLog.log(context, TAG, "Stopping ringing natively for id=$alarmId (watch-originated stop)")
        context.stopService(Intent(context, AlarmRingingService::class.java))
        return TAG_RINGING_STOPPED
    }
}

/** One `wear:alarm:dismiss`/`wear:alarm:snooze` payload's field this listener cares about. */
internal data class WatchStopPayload(val alarmId: Int)

/**
 * Parses the `{alarmId, ...}` JSON payload wear-sync publishes to [NativeEventBus] for watch-originated dismiss/snooze -- mirrors the wire shape of Rust's `WatchDismissAlarm`/`WatchSnoozeAlarm` (`plugins/wear-sync/src/models.rs`, `#[serde(rename_all = "camelCase")]`), which is also the shape of the watch's own raw message payload (`{"alarmId":7}`/`{"alarmId":7,"snoozeLengthMinutes":10}`) that `WearMessageService` receives before any Rust involvement. Tolerates and ignores any other fields (`eventId`, `snoozeLengthMinutes`) -- this listener only needs the id. Returns `null` for anything malformed or missing a usable `alarmId`, rather than throwing.
 */
internal fun parseWatchStopPayload(payload: String): WatchStopPayload? {
    return try {
        val json = JSONObject(payload)
        val alarmId = json.optInt("alarmId", -1)
        if (alarmId <= 0) return null
        WatchStopPayload(alarmId)
    } catch (e: Exception) {
        null
    }
}

/**
 * Whether a watch-originated dismiss/snooze [payload] should stop [AlarmRingingService]: returns the alarm id to stop when [payload] parses to a positive id that matches [currentlyRingingAlarmId], `null` otherwise (malformed payload, or the watch's target alarm isn't the one actually ringing on this phone right now -- e.g. it already stopped locally, or this is a stale/redelivered signal for a since-finished ring).
 *
 * A pure function of a payload string and an int (not reading [AlarmRingingService.currentlyRingingAlarmId] itself) so it's unit-testable without an Android framework -- mirrors [AlarmReceiver]'s `recordAndPublishFiredEvent` taking `isLive` as a parameter, and [resolveStopRingingAlarmId] in this same plugin.
 */
internal fun shouldStopForWatchSignal(payload: String, currentlyRingingAlarmId: Int): Int? {
    val stop = parseWatchStopPayload(payload) ?: return null
    if (currentlyRingingAlarmId <= 0 || currentlyRingingAlarmId != stop.alarmId) return null
    return stop.alarmId
}
