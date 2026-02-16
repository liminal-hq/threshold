package com.plugin.alarmmanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Boot completed, rescheduling alarms")

            val alarms = AlarmUtils.loadAllFromPrefs(context)
            val now = System.currentTimeMillis()

            for ((id, trigger, soundUri) in alarms) {
                if (trigger > now) {
                    AlarmUtils.scheduleAlarm(context, id, trigger, soundUri)
                    Log.d("BootReceiver", "Rescheduled alarm $id")
                } else {
                    Log.d("BootReceiver", "Cleaning up expired alarm $id")
                    AlarmUtils.cancelAlarm(context, id)
                }
            }
        }
    }
}
