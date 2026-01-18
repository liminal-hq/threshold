package com.plugin.alarmmanager

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
        val allPrefs = prefs.all
        val now = System.currentTimeMillis()

        for ((key, value) in allPrefs) {
            // Filter only keys starting with "alarm_" but NOT "alarm_sound_"
            // (Since "alarm_sound_" keys are strings, and "alarm_" keys are Longs, type check helps too)
            if (key.startsWith("alarm_") && !key.startsWith("alarm_sound_") && value is Long) {
                val alarmId = key.removePrefix("alarm_").toIntOrNull() ?: continue
                val triggerAt = value

                if (triggerAt > now) {
                    val soundUri = prefs.getString("alarm_sound_$alarmId", null)
                    AlarmUtils.scheduleAlarm(context, alarmId, triggerAt, soundUri)
                    Log.d("BootReceiver", "Rescheduled alarm $alarmId at $triggerAt")
                } else {
                    // Clean up old alarms
                    AlarmUtils.removeAlarmFromPrefs(context, alarmId)
                }
            }
        }
    }
}
