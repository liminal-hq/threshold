// BroadcastReceiver for native alarm triggers that starts phone ringing service
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import ca.liminalhq.threshold.nativebus.NativeEventBus
import org.json.JSONObject

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // goAsync() extends Android's short (~10s) broadcast-dispatch ANR budget to cover the
        // work below -- the NativeEventBus publish and AlarmManagerPlugin.notifyAlarmFired's
        // queue write are each individually cheap, but this still runs on the main thread and
        // the margin is worth it. pendingResult.finish() must run on every exit path, including
        // the early-return guard below, so the try/finally wraps the whole handler.
        val pendingResult = goAsync()
        try {
            handleAlarmBroadcast(context, intent)
        } finally {
            pendingResult.finish()
        }
    }

    private fun handleAlarmBroadcast(context: Context, intent: Intent) {
        Log.d("AlarmReceiver", "========== ALARM RECEIVER START ==========")
        Log.d("AlarmReceiver", "Alarm Received! Action: ${intent.action}")
        val alarmId = intent.getIntExtra("ALARM_ID", -1)
        val soundUri = intent.getStringExtra("ALARM_SOUND_URI")
        Log.d("AlarmReceiver", "Alarm ID: $alarmId, Sound URI: $soundUri")
        NativeEventLog.log(context, "AlarmReceiver", "Received alarm id=$alarmId")

        // Guard: skip alarms that were cancelled or deleted before this broadcast was processed.
        // cancelAlarm() removes the prefs entry atomically with the AlarmManager cancellation, so
        // a missing entry means the alarm is definitively gone even if the broadcast was in-flight.
        // This runs before the NativeEventBus publish below (not after, despite that publish
        // otherwise being the very first thing done for a firing alarm) precisely because a
        // cancelled/deleted alarm must never reach wear-sync's native listener -- publishing
        // first would let the watch ring for an alarm this receiver is about to disown.
        if (!AlarmUtils.isAlarmLive(context, alarmId)) {
            Log.w("AlarmReceiver", "Alarm $alarmId no longer live — skipping fire (deleted/cancelled)")
            Log.d("AlarmReceiver", "========== ALARM RECEIVER END (skipped) ==========")
            NativeEventLog.log(context, "AlarmReceiver", "Skipped alarm id=$alarmId (no longer live)")
            return
        }

        // Publish onto NativeEventBus first, ahead of everything else this method does for a
        // confirmed-live alarm, so wear-sync's native listener (registered in the same
        // already-alive cold process, per issue #255 Phase 3) can ring the watch immediately --
        // with no dependency on Rust/WebView having booted. See
        // docs/architecture/255-phase3-payload-contract.md for the frozen payload shape and the
        // "watch-ring" tag literal.
        val actualFiredAt = System.currentTimeMillis()
        val handledNatively = publishAlarmFiredToBus(alarmId, actualFiredAt)

        AlarmManagerPlugin.notifyAlarmFired(context, alarmId, actualFiredAt, handledNatively)

        // Start the foreground service for sound/notification
        // The notification's full-screen intent will launch the app with the alarm ID
        // and onNewIntent() in the plugin will handle emitting the event to the frontend
        Log.d("AlarmReceiver", "Starting AlarmRingingService...")
        val serviceIntent = Intent(context, AlarmRingingService::class.java).apply {
            putExtra("ALARM_ID", alarmId)
            putExtra("ALARM_SOUND_URI", soundUri)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
            Log.d("AlarmReceiver", "Started foreground service (API 26+)")
        } else {
            context.startService(serviceIntent)
            Log.d("AlarmReceiver", "Started service (API < 26)")
        }

        Log.d("AlarmReceiver", "Service started. Notification will launch app via full-screen intent.")
        Log.d("AlarmReceiver", "========== ALARM RECEIVER END ==========")
        NativeEventLog.log(context, "AlarmReceiver", "Started AlarmRingingService for alarm id=$alarmId")
    }
}

/**
 * Publishes the fired event on [NativeEventBus] for [alarmId]/[actualFiredAt] and returns the
 * tags any in-process listeners (e.g. wear-sync's cold-process ring handler) reported handling
 * it with -- see docs/architecture/255-phase3-payload-contract.md. Factored out of
 * [AlarmReceiver] so it's unit-testable without a real `BroadcastReceiver` dispatch (`goAsync()`
 * requires a live Android framework, `onReceive()` itself does not) -- see AlarmReceiverTest.
 */
internal fun publishAlarmFiredToBus(alarmId: Int, actualFiredAt: Long): Set<String> {
    val payload = JSONObject().apply {
        put("id", alarmId)
        put("actualFiredAt", actualFiredAt)
    }
    return NativeEventBus.publish(TOPIC_FIRED, payload.toString())
}
