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

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Spike-only instrumentation for issue #255 Phase 0 (ContentProvider registration-ordering spike) -- logged first thing so a human tester can compare this timestamp against BusInitProvider.onCreate()'s in a real device's exported NativeEventLog output. See docs/spikes/255-contentprovider-spike-protocol.md. Remove once Phase 0 concludes.
        NativeEventLog.log(context, "AlarmReceiver", "#255 Phase 0 spike: onReceive() fired")

        Log.d("AlarmReceiver", "========== ALARM RECEIVER START ==========")
        Log.d("AlarmReceiver", "Alarm Received! Action: ${intent.action}")
        val alarmId = intent.getIntExtra("ALARM_ID", -1)
        val soundUri = intent.getStringExtra("ALARM_SOUND_URI")
        Log.d("AlarmReceiver", "Alarm ID: $alarmId, Sound URI: $soundUri")
        NativeEventLog.log(context, "AlarmReceiver", "Received alarm id=$alarmId")

        // Guard: skip alarms that were cancelled or deleted before this broadcast was processed.
        // cancelAlarm() removes the prefs entry atomically with the AlarmManager cancellation, so
        // a missing entry means the alarm is definitively gone even if the broadcast was in-flight.
        if (!AlarmUtils.isAlarmLive(context, alarmId)) {
            Log.w("AlarmReceiver", "Alarm $alarmId no longer live — skipping fire (deleted/cancelled)")
            Log.d("AlarmReceiver", "========== ALARM RECEIVER END (skipped) ==========")
            NativeEventLog.log(context, "AlarmReceiver", "Skipped alarm id=$alarmId (no longer live)")
            return
        }

        AlarmManagerPlugin.notifyAlarmFired(context, alarmId)

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
