// Dedicated activity for the alarm ringing screen — shown on lock screen
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.presentation

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.util.Log
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import ca.liminalhq.threshold.wear.ThresholdWearApp
import ca.liminalhq.threshold.wear.presentation.theme.ThresholdWearTheme
import ca.liminalhq.threshold.wear.service.WearRingingService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

private const val TAG = "RingingActivity"

/**
 * Full-screen alarm ringing activity for the Wear OS companion app.
 *
 * This activity is launched by [WearRingingService]'s full-screen
 * notification intent. It shows the [RingingScreen] composable and
 * handles Stop / Snooze actions.
 *
 * Window flags ensure the screen turns on and shows over the lock screen.
 */
class RingingActivity : ComponentActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureWindowForAlarm()

        val alarmId = intent.getIntExtra(WearRingingService.EXTRA_ALARM_ID, -1)
        val label = intent.getStringExtra(WearRingingService.EXTRA_ALARM_LABEL) ?: ""
        val hour = intent.getIntExtra(WearRingingService.EXTRA_ALARM_HOUR, 0)
        val minute = intent.getIntExtra(WearRingingService.EXTRA_ALARM_MINUTE, 0)
        val snoozeLength = intent.getIntExtra(WearRingingService.EXTRA_SNOOZE_LENGTH, 10)
        val prefs = applicationContext.getSharedPreferences("threshold_wear", Context.MODE_PRIVATE)
        val is24Hour = prefs.getBoolean("is_24_hour", DateFormat.is24HourFormat(this))

        Log.d(TAG, "Ringing activity created for alarm $alarmId ($hour:$minute '$label', is24h=$is24Hour)")

        val app = application as ThresholdWearApp
        val dataLayerClient = app.dataLayerClient
        val alarmScheduler = app.alarmScheduler

        setContent {
            ThresholdWearTheme {
                RingingScreen(
                    hour = hour,
                    minute = minute,
                    label = label,
                    is24Hour = is24Hour,
                    snoozeLengthMinutes = snoozeLength,
                    onStop = {
                        Log.d(TAG, "Stop pressed for alarm $alarmId")
                        stopRingingService()
                        scope.launch {
                            dataLayerClient.sendDismissAlarm(alarmId)
                        }
                        finish()
                    },
                    onSnooze = {
                        Log.d(TAG, "Snooze pressed for alarm $alarmId (${snoozeLength}m)")
                        stopRingingService()
                        scope.launch {
                            // Always schedule a local snooze alarm so the
                            // alarm re-fires even if the phone is unreachable.
                            // If the phone IS connected, the message tells it
                            // to snooze too; the ring deduplication on the watch
                            // prevents a double ring if the phone also triggers.
                            alarmScheduler.scheduleSnooze(
                                alarmId, hour, minute, label, snoozeLength,
                            )
                            dataLayerClient.sendSnoozeAlarm(alarmId, snoozeLength)
                        }
                        finish()
                    },
                )
            }
        }
    }

    /**
     * Configure the window to show over the lock screen with the screen on.
     */
    private fun configureWindowForAlarm() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
            )
        }
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun stopRingingService() {
        val serviceIntent = Intent(this, WearRingingService::class.java).apply {
            action = WearRingingService.ACTION_DISMISS
        }
        startService(serviceIntent)
    }
}
