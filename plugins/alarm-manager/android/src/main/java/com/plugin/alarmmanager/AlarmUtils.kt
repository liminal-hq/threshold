package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

object AlarmUtils {
    fun scheduleAlarm(context: Context, id: Int, triggerAt: Long, soundUri: String?) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "com.threshold.ALARM_TRIGGER"
            putExtra("ALARM_ID", id)
            if (soundUri != null) {
                putExtra("ALARM_SOUND_URI", soundUri)
            }
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmInfo = AlarmManager.AlarmClockInfo(triggerAt, pendingIntent)
        alarmManager.setAlarmClock(alarmInfo, pendingIntent)
    }

    fun cancelAlarm(context: Context, id: Int) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "com.threshold.ALARM_TRIGGER"
            putExtra("ALARM_ID", id)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
    }

    fun saveAlarmToPrefs(context: Context, id: Int, triggerAt: Long, soundUri: String?) {
        val prefs = context.getSharedPreferences("ThresholdNative", Context.MODE_PRIVATE)
        val editor = prefs.edit()
        editor.putLong("alarm_$id", triggerAt)
        if (soundUri != null) {
            editor.putString("alarm_sound_$id", soundUri)
        } else {
            editor.remove("alarm_sound_$id")
        }
        editor.apply()
    }

    fun removeAlarmFromPrefs(context: Context, id: Int) {
        val prefs = context.getSharedPreferences("ThresholdNative", Context.MODE_PRIVATE)
        prefs.edit()
            .remove("alarm_$id")
            .remove("alarm_sound_$id")
            .apply()
    }
}
