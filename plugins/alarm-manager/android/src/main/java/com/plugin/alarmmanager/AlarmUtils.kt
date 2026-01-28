package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log

object AlarmUtils {
    private const val PREFS_NAME = "ThresholdNative"
    private const val TAG = "AlarmUtils"

    @JvmStatic
    fun scheduleAlarm(
        context: Context,
        id: Int,
        triggerAtMillis: Long,
        soundUri: String?
    ) {
        Log.d(TAG, "Scheduling alarm $id at $triggerAtMillis")

        // 1. Save to SharedPreferences for boot recovery
        saveToPrefs(context, id, triggerAtMillis, soundUri)

        // 2. Schedule via AlarmManager
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

        val info = AlarmManager.AlarmClockInfo(triggerAtMillis, pendingIntent)
        alarmManager.setAlarmClock(info, pendingIntent)

        Log.d(TAG, "Alarm $id scheduled successfully")
    }

    @JvmStatic
    fun cancelAlarm(context: Context, id: Int) {
        Log.d(TAG, "Cancelling alarm $id")

        // 1. Remove from SharedPreferences
        removeFromPrefs(context, id)

        // 2. Cancel via AlarmManager
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
        pendingIntent.cancel()

        Log.d(TAG, "Alarm $id cancelled successfully")
    }

    private fun saveToPrefs(context: Context, id: Int, trigger: Long, soundUri: String?) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putLong("alarm_$id", trigger)
            if (soundUri != null) {
                putString("alarm_sound_$id", soundUri)
            } else {
                remove("alarm_sound_$id")
            }
            apply()
        }
    }

    private fun removeFromPrefs(context: Context, id: Int) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            remove("alarm_$id")
            remove("alarm_sound_$id")
            apply()
        }
    }

    fun loadAllFromPrefs(context: Context): List<Triple<Int, Long, String?>> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val all = prefs.all
        val alarms = mutableListOf<Triple<Int, Long, String?>>()

        for ((key, value) in all) {
            if (key.startsWith("alarm_") && !key.contains("sound")) {
                val idStr = key.removePrefix("alarm_")
                val id = idStr.toIntOrNull() ?: continue
                val trigger = value as? Long ?: continue
                val soundUri = prefs.getString("alarm_sound_$id", null)

                alarms.add(Triple(id, trigger, soundUri))
            }
        }

        return alarms
    }
}
