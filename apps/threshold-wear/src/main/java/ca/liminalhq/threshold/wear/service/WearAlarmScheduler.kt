// Schedules local alarms on the watch via AlarmManager for disconnected fallback
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import ca.liminalhq.threshold.wear.data.WatchAlarm

private const val TAG = "WearAlarmScheduler"

/**
 * Schedules and cancels local alarms on the watch using [AlarmManager].
 *
 * When the phone is connected, alarms fire on the phone and the watch
 * receives a ring message via the Data Layer. When the phone is
 * disconnected, the watch schedules its own alarms as a fallback so
 * the user is still woken up.
 *
 * Each alarm is scheduled with [AlarmManager.setAlarmClock] for the
 * highest priority (shows on the lock screen and fires in Doze mode).
 * The [WearAlarmReceiver] BroadcastReceiver triggers when the alarm
 * fires and starts [WearRingingService].
 */
class WearAlarmScheduler(private val context: Context) {

    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    /**
     * Reconcile local alarm schedule with the current alarm list.
     *
     * Cancels all existing local alarms, then schedules new ones for
     * each enabled alarm with a future [WatchAlarm.nextTrigger].
     */
    fun reconcile(alarms: List<WatchAlarm>) {
        var scheduled = 0
        var cancelled = 0

        for (alarm in alarms) {
            val pending = buildPendingIntent(alarm.id)
            if (alarm.enabled && alarm.nextTrigger != null && alarm.nextTrigger > System.currentTimeMillis()) {
                schedule(alarm)
                scheduled++
            } else {
                alarmManager.cancel(pending)
                cancelled++
            }
        }

        Log.d(TAG, "Reconciled: $scheduled scheduled, $cancelled cancelled")
    }

    /**
     * Schedule a single alarm using [AlarmManager.setAlarmClock].
     *
     * setAlarmClock is the strongest guarantee on Android — it fires
     * even in Doze mode and shows an alarm icon on the lock screen.
     */
    fun schedule(alarm: WatchAlarm) {
        val triggerAt = alarm.nextTrigger ?: return
        if (triggerAt <= System.currentTimeMillis()) {
            Log.d(TAG, "Skipping alarm ${alarm.id} — trigger time is in the past")
            return
        }

        val pendingIntent = buildPendingIntent(alarm.id)

        // AlarmClockInfo shows the alarm on the lock screen
        val showIntent = PendingIntent.getActivity(
            context, alarm.id,
            Intent(context, ca.liminalhq.threshold.wear.presentation.RingingActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val alarmClockInfo = AlarmManager.AlarmClockInfo(triggerAt, showIntent)
        alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)

        Log.d(TAG, "Scheduled alarm ${alarm.id} at $triggerAt (${alarm.hour}:${"%02d".format(alarm.minute)} '${alarm.label}')")
    }

    /** Cancel a single alarm by its ID. */
    fun cancel(alarmId: Int) {
        val pendingIntent = buildPendingIntent(alarmId)
        alarmManager.cancel(pendingIntent)
        Log.d(TAG, "Cancelled alarm $alarmId")
    }

    /** Cancel all local alarms for the given list. */
    fun cancelAll(alarms: List<WatchAlarm>) {
        for (alarm in alarms) {
            cancel(alarm.id)
        }
        Log.d(TAG, "Cancelled ${alarms.size} alarm(s)")
    }

    private fun buildPendingIntent(alarmId: Int): PendingIntent {
        val intent = Intent(context, WearAlarmReceiver::class.java).apply {
            action = WearAlarmReceiver.ACTION_ALARM_FIRED
            putExtra(WearAlarmReceiver.EXTRA_ALARM_ID, alarmId)
        }
        return PendingIntent.getBroadcast(
            context, alarmId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
