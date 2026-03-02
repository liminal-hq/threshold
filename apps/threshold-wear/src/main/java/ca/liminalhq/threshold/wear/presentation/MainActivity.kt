// Single-activity Compose host for the Wear OS app with navigation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.presentation

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import ca.liminalhq.threshold.wear.ThresholdWearApp
import ca.liminalhq.threshold.wear.presentation.theme.ThresholdWearTheme
import ca.liminalhq.threshold.wear.service.WearRingingService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Single-activity host for the Threshold Wear OS companion app.
 *
 * On launch, requests a sync from the phone so the alarm list is fresh.
 * Navigation is handled by [SwipeDismissableNavHost] with routes:
 * - `alarms` — main alarm list (default)
 * - `settings` — lightweight settings with test ring
 */
class MainActivity : ComponentActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as ThresholdWearApp
        val repository = app.alarmRepository
        val dataLayerClient = app.dataLayerClient

        // Request initial sync from phone
        scope.launch {
            dataLayerClient.requestSync(repository.getLastRevision())
        }

        setContent {
            ThresholdWearTheme {
                val navController = rememberSwipeDismissableNavController()

                SwipeDismissableNavHost(
                    navController = navController,
                    startDestination = "alarms",
                ) {
                    composable("alarms") {
                        AlarmListScreen(
                            repository = repository,
                            onToggleAlarm = { alarm ->
                                scope.launch {
                                    dataLayerClient.sendSaveAlarm(
                                        alarmId = alarm.id,
                                        enabled = !alarm.enabled,
                                        watchRevision = repository.getLastRevision(),
                                    )
                                }
                            },
                            onDeleteAlarm = { alarm ->
                                scope.launch {
                                    dataLayerClient.sendDeleteAlarm(
                                        alarmId = alarm.id,
                                        watchRevision = repository.getLastRevision(),
                                    )
                                }
                            },
                            onRefresh = {
                                scope.launch {
                                    dataLayerClient.requestSync(repository.getLastRevision())
                                }
                            },
                            onNavigateToSettings = {
                                navController.navigate("settings")
                            },
                        )
                    }

                    composable("settings") {
                        SettingsScreen(
                            onTestRing = {
                                triggerTestRing()
                            },
                        )
                    }
                }
            }
        }
    }

    /**
     * Trigger a local test ring on the watch (alarm ID 999).
     */
    private fun triggerTestRing() {
        val serviceIntent = Intent(this, WearRingingService::class.java).apply {
            putExtra(WearRingingService.EXTRA_ALARM_ID, 999)
            putExtra(WearRingingService.EXTRA_ALARM_LABEL, "Test Alarm")
            putExtra(WearRingingService.EXTRA_ALARM_HOUR, 7)
            putExtra(WearRingingService.EXTRA_ALARM_MINUTE, 22)
            putExtra(WearRingingService.EXTRA_SNOOZE_LENGTH, 10)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }
}
