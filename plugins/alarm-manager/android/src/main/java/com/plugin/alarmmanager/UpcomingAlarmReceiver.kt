// BroadcastReceiver for the upcoming-alarm reminder's wake-up and its Dismiss/Snooze actions
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.concurrent.Executors

class UpcomingAlarmReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "UpcomingAlarmReceiver"

        // Same reasoning as AlarmReceiver's executor: goAsync() only helps if the work really leaves the main thread. AlarmManagerPlugin's own methods are @Synchronized, so one worker is enough.
        private val backgroundExecutor = Executors.newSingleThreadExecutor()
    }

    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getIntExtra(UpcomingAlarmNotifier.EXTRA_ALARM_ID, -1)
        val action = intent.action
        val appContext = context.applicationContext
        val pendingResult = goAsync()
        backgroundExecutor.execute {
            try {
                handle(appContext, action, alarmId)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to handle $action for alarm $alarmId", e)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun handle(context: Context, action: String?, alarmId: Int) {
        if (alarmId <= 0) return
        when (action) {
            UpcomingAlarmNotifier.ACTION_POST -> UpcomingAlarmNotifier.postStored(context, alarmId)
            UpcomingAlarmNotifier.ACTION_DISMISS -> {
                NativeEventLog.log(context, TAG, "Dismiss action received for upcoming alarm id=$alarmId")
                UpcomingAlarmNotifier.clearNotification(context, alarmId)
                AlarmManagerPlugin.notifyUpcomingDismissRequested(context, alarmId)
            }
            UpcomingAlarmNotifier.ACTION_SNOOZE -> {
                NativeEventLog.log(context, TAG, "Snooze action received for upcoming alarm id=$alarmId")
                UpcomingAlarmNotifier.clearNotification(context, alarmId)
                AlarmManagerPlugin.notifyUpcomingSnoozeRequested(context, alarmId)
            }
        }
    }
}
