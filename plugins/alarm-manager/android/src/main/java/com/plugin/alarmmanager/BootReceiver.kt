// Reschedules alarms after device boot
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

private const val TAG = "BootReceiver"

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed, rescheduling alarms")

            val alarms = AlarmUtils.loadAllFromPrefs(context)
            val now = System.currentTimeMillis()
            NativeEventLog.log(context, TAG, "Boot completed, ${alarms.size} alarm(s) to evaluate")

            var rescheduled = 0
            var expired = 0
            for ((id, trigger, soundUri) in alarms) {
                if (trigger > now) {
                    AlarmUtils.scheduleAlarm(context, id, trigger, soundUri)
                    Log.d(TAG, "Rescheduled alarm $id")
                    rescheduled++
                } else {
                    Log.d(TAG, "Cleaning up expired alarm $id")
                    AlarmUtils.cancelAlarm(context, id)
                    expired++
                }
            }
            NativeEventLog.log(context, TAG, "Boot reschedule complete: $rescheduled rescheduled, $expired expired")
        }
    }
}
