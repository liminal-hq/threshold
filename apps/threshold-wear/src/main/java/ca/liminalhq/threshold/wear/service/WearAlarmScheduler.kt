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
private const val PREFS_NAME = "threshold_wear_scheduler"
private const val KEY_SCHEDULED_IDS = "scheduled_alarm_ids"

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
 *
 * Tracks scheduled alarm IDs in SharedPreferences so that orphaned
 * alarms (deleted on the phone but still scheduled locally) can be
 * cancelled during reconciliation.
 */
class WearAlarmScheduler(private val context: Context) {

    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /**
     * Reconcile local alarm schedule with the current alarm list.
     *
     * First cancels orphaned alarms (previously scheduled but no longer
     * in the alarm list — i.e. deleted on the phone), then schedules or
     * cancels each current alarm based on its enabled state and trigger time.
     */
    fun reconcile(alarms: List<WatchAlarm>) {
        val currentIds = alarms.map { it.id }.toSet()
        val previousIds = getScheduledIds()
        var scheduled = 0
        var cancelled = 0

        // Cancel orphaned alarms that are no longer in the alarm list
        val orphanedIds = previousIds - currentIds
        for (id in orphanedIds) {
            alarmManager.cancel(buildPendingIntent(id))
            cancelled++
            Log.d(TAG, "Cancelled orphaned alarm $id (deleted on phone)")
        }

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

        // Persist the set of currently scheduled IDs
        val scheduledIds = alarms
            .filter { it.enabled && it.nextTrigger != null && it.nextTrigger > System.currentTimeMillis() }
            .map { it.id }
            .toSet()
        saveScheduledIds(scheduledIds)

        Log.d(TAG, "Reconciled: $scheduled scheduled, $cancelled cancelled (${orphanedIds.size} orphaned)")
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

    /**
     * Schedule a snooze alarm that fires after the given delay.
     *
     * Used when the user taps Snooze during offline fallback — the phone
     * is unreachable so the watch must schedule the follow-up locally.
     */
    fun scheduleSnooze(alarmId: Int, hour: Int, minute: Int, label: String, delayMinutes: Int) {
        val triggerAt = System.currentTimeMillis() + delayMinutes * 60_000L
        val pendingIntent = buildPendingIntent(alarmId)

        val showIntent = PendingIntent.getActivity(
            context, alarmId,
            Intent(context, ca.liminalhq.threshold.wear.presentation.RingingActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val alarmClockInfo = AlarmManager.AlarmClockInfo(triggerAt, showIntent)
        alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)

        // Track this snooze alarm
        val ids = getScheduledIds() + alarmId
        saveScheduledIds(ids)

        Log.d(TAG, "Scheduled snooze for alarm $alarmId in ${delayMinutes}m (trigger at $triggerAt)")
    }

    /** Cancel a single alarm by its ID. */
    fun cancel(alarmId: Int) {
        val pendingIntent = buildPendingIntent(alarmId)
        alarmManager.cancel(pendingIntent)

        val ids = getScheduledIds() - alarmId
        saveScheduledIds(ids)

        Log.d(TAG, "Cancelled alarm $alarmId")
    }

    /** Cancel all local alarms for the given list and clear tracked IDs. */
    fun cancelAll(alarms: List<WatchAlarm>) {
        for (alarm in alarms) {
            alarmManager.cancel(buildPendingIntent(alarm.id))
        }
        // Also cancel any orphaned IDs not in the list
        val currentIds = alarms.map { it.id }.toSet()
        for (id in getScheduledIds() - currentIds) {
            alarmManager.cancel(buildPendingIntent(id))
        }
        saveScheduledIds(emptySet())
        Log.d(TAG, "Cancelled all alarms")
    }

    private fun getScheduledIds(): Set<Int> {
        return prefs.getStringSet(KEY_SCHEDULED_IDS, emptySet())
            ?.mapNotNull { it.toIntOrNull() }
            ?.toSet()
            ?: emptySet()
    }

    private fun saveScheduledIds(ids: Set<Int>) {
        prefs.edit()
            .putStringSet(KEY_SCHEDULED_IDS, ids.map { it.toString() }.toSet())
            .apply()
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
