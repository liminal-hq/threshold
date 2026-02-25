// BroadcastReceiver for locally scheduled alarms — starts WearRingingService
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import ca.liminalhq.threshold.wear.ThresholdWearApp
import java.util.Calendar

private const val TAG = "WearAlarmReceiver"

/**
 * Receives locally scheduled alarm broadcasts and starts [WearRingingService].
 *
 * This receiver is triggered by [WearAlarmScheduler] when the watch fires
 * an alarm independently (phone disconnected). It looks up the alarm
 * details from the [AlarmRepository] and starts the ringing service
 * with the same extras the phone would send via the Data Layer.
 */
class WearAlarmReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ALARM_FIRED = "ca.liminalhq.threshold.wear.ACTION_ALARM_FIRED"
        const val EXTRA_ALARM_ID = "alarm_id"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_ALARM_FIRED) return

        val alarmId = intent.getIntExtra(EXTRA_ALARM_ID, -1)
        if (alarmId < 0) {
            Log.w(TAG, "Received alarm broadcast with invalid ID")
            return
        }

        Log.d(TAG, "Local alarm fired: id=$alarmId")

        // Look up alarm details from the repository
        val app = context.applicationContext as? ThresholdWearApp
        val alarm = app?.alarmRepository?.alarms?.value?.find { it.id == alarmId }

        val hour: Int
        val minute: Int
        val label: String

        if (alarm != null) {
            hour = alarm.hour
            minute = alarm.minute
            label = alarm.label
        } else {
            // Fallback: use current time if alarm not found in cache
            val cal = Calendar.getInstance()
            hour = cal.get(Calendar.HOUR_OF_DAY)
            minute = cal.get(Calendar.MINUTE)
            label = ""
            Log.w(TAG, "Alarm $alarmId not found in repository, using current time")
        }

        // Read snooze length synced from the phone (falls back to 10 minutes)
        val snoozeLength = context.applicationContext
            .getSharedPreferences("threshold_wear", android.content.Context.MODE_PRIVATE)
            .getInt("snooze_length_minutes", 10)

        val serviceIntent = Intent(context, WearRingingService::class.java).apply {
            putExtra(WearRingingService.EXTRA_ALARM_ID, alarmId)
            putExtra(WearRingingService.EXTRA_ALARM_LABEL, label)
            putExtra(WearRingingService.EXTRA_ALARM_HOUR, hour)
            putExtra(WearRingingService.EXTRA_ALARM_MINUTE, minute)
            putExtra(WearRingingService.EXTRA_SNOOZE_LENGTH, snoozeLength)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
