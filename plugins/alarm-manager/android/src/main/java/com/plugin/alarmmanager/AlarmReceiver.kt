package com.plugin.alarmmanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d("AlarmReceiver", "========== ALARM RECEIVER START ==========")
        Log.d("AlarmReceiver", "Alarm Received! Action: ${intent.action}")
        val alarmId = intent.getIntExtra("ALARM_ID", -1)
        val soundUri = intent.getStringExtra("ALARM_SOUND_URI")
        Log.d("AlarmReceiver", "Alarm ID: $alarmId, Sound URI: $soundUri")

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
    }
}
