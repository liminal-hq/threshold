package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Boot completed, rescheduling alarms...")
            rescheduleAlarms(context)
        }
    }

    private fun rescheduleAlarms(context: Context) {
        val prefs = context.getSharedPreferences("WindowAlarmNative", Context.MODE_PRIVATE)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val allPrefs = prefs.all

        val now = System.currentTimeMillis()

        for ((key, value) in allPrefs) {
            if (key.startsWith("alarm_") && value is Long) {
                val alarmId = key.removePrefix("alarm_").toIntOrNull() ?: continue
                val triggerAt = value

                if (triggerAt > now) {
                    val intent = Intent(context, AlarmReceiver::class.java).apply {
                        action = "com.windowalarm.ALARM_TRIGGER"
                        putExtra("ALARM_ID", alarmId)
                    }

                    val pendingIntent = PendingIntent.getBroadcast(
                        context,
                        alarmId,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )

                    val alarmInfo = AlarmManager.AlarmClockInfo(triggerAt, pendingIntent)
                    alarmManager.setAlarmClock(alarmInfo, pendingIntent)
                    Log.d("BootReceiver", "Rescheduled alarm $alarmId at $triggerAt")
                } else {
                    // Clean up old alarms
                    prefs.edit().remove(key).apply()
                }
            }
        }
    }
}
