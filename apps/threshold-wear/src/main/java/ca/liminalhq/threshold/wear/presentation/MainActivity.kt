package ca.liminalhq.threshold.wear.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import ca.liminalhq.threshold.wear.ThresholdWearApp
import ca.liminalhq.threshold.wear.presentation.theme.ThresholdWearTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Single-activity host for the Threshold Wear OS companion app.
 *
 * On launch, requests a sync from the phone so the alarm list is fresh.
 * The UI is built with Compose for Wear OS.
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
                )
            }
        }
    }
}
