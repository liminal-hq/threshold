package com.plugin.alarmmanager

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import android.graphics.Color
import android.media.AudioAttributes
import android.net.Uri

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d("AlarmReceiver", "Alarm Received!")
        val alarmId = intent.getIntExtra("ALARM_ID", -1)

        val packageName = context.packageName
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("isAlarmTriggered", true)
            putExtra("alarmId", alarmId)
        }

        if (launchIntent == null) {
            Log.e("AlarmReceiver", "Could not find launch intent for package $packageName")
            return
        }

        // Create Full Screen Pending Intent
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            alarmId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "window_alarm_channel"

        // Create Channel if needed (High Importance for Heads-up / Full Screen)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Window Alarm",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Channel for Alarm Clock"
                enableLights(true)
                lightColor = Color.RED
                enableVibration(true)
                setSound(
                    android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI,
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Build Notification
        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm) // Use system icon for MVP
            .setContentTitle("Window Alarm")
            .setContentText("Tap to dismiss")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true) // Critical for Android 10+
            .setAutoCancel(true)
            .setSound(android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI)

        notificationManager.notify(alarmId, builder.build())
    }
}
