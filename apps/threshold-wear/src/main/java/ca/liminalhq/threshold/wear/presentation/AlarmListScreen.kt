// Compose for Wear OS alarm list UI with sync status and delete confirmation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.presentation

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Card
import androidx.wear.compose.material.CardDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.dialog.Alert
import kotlinx.coroutines.launch
import ca.liminalhq.threshold.wear.data.AlarmRepository
import ca.liminalhq.threshold.wear.data.SyncStatus
import ca.liminalhq.threshold.wear.data.WatchAlarm
import ca.liminalhq.threshold.wear.presentation.theme.ThresholdAccent
import ca.liminalhq.threshold.wear.presentation.theme.ThresholdDisabled
import ca.liminalhq.threshold.wear.presentation.theme.ThresholdSurface

/**
 * Main alarm list screen for the Threshold Wear OS companion app.
 *
 * Displays alarms in a [ScalingLazyColumn] optimised for round watch displays.
 * Each alarm shows the time, label, and an enabled/disabled status indicator.
 * Tapping the status dot toggles the alarm. Long-press shows a delete option.
 */
@Composable
fun AlarmListScreen(
    repository: AlarmRepository,
    onToggleAlarm: (WatchAlarm) -> Unit,
    onDeleteAlarm: (WatchAlarm) -> Unit,
    onRefresh: () -> Unit,
) {
    val alarms by repository.alarms.collectAsState()
    val syncStatus by repository.syncStatus.collectAsState()
    var alarmToDelete by remember { mutableStateOf<WatchAlarm?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colors.background),
    ) {
        if (alarms.isEmpty()) {
            EmptyState(syncStatus, onRefresh)
        } else {
            AlarmList(
                alarms = alarms,
                syncStatus = syncStatus,
                onToggleAlarm = onToggleAlarm,
                onDeleteRequest = { alarmToDelete = it },
            )
        }

        // Delete confirmation dialog
        alarmToDelete?.let { alarm ->
            DeleteConfirmDialog(
                alarm = alarm,
                onConfirm = {
                    onDeleteAlarm(alarm)
                    alarmToDelete = null
                },
                onDismiss = { alarmToDelete = null },
            )
        }
    }
}

@Composable
private fun AlarmList(
    alarms: List<WatchAlarm>,
    syncStatus: SyncStatus,
    onToggleAlarm: (WatchAlarm) -> Unit,
    onDeleteRequest: (WatchAlarm) -> Unit,
) {
    val listState = rememberScalingLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    ScalingLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .onRotaryScrollEvent { event ->
                coroutineScope.launch {
                    listState.scrollBy(event.verticalScrollPixels)
                }
                true
            }
            .focusRequester(focusRequester)
            .focusable(),
        state = listState,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Sync status header
        item {
            SyncStatusIndicator(syncStatus)
        }

        items(alarms, key = { it.id }) { alarm ->
            AlarmCard(
                alarm = alarm,
                onToggle = { onToggleAlarm(alarm) },
                onLongPress = { onDeleteRequest(alarm) },
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AlarmCard(
    alarm: WatchAlarm,
    onToggle: () -> Unit,
    onLongPress: () -> Unit,
) {
    Card(
        onClick = onToggle,
        backgroundPainter = CardDefaults.cardBackgroundPainter(
            startBackgroundColor = ThresholdSurface,
            endBackgroundColor = ThresholdSurface,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 2.dp)
            .combinedClickable(
                onClick = onToggle,
                onLongClick = onLongPress,
            ),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            // Enabled/disabled indicator dot
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(if (alarm.enabled) ThresholdAccent else ThresholdDisabled),
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = alarm.timeDisplay,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (alarm.enabled) {
                        MaterialTheme.colors.onSurface
                    } else {
                        MaterialTheme.colors.onSurface.copy(alpha = 0.5f)
                    },
                )

                if (alarm.label.isNotBlank()) {
                    Text(
                        text = alarm.label,
                        fontSize = 13.sp,
                        color = MaterialTheme.colors.onSurface.copy(alpha = 0.6f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun SyncStatusIndicator(syncStatus: SyncStatus) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        when (syncStatus) {
            SyncStatus.CONNECTED -> {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF4CAF50)),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Connected",
                    fontSize = 11.sp,
                    color = MaterialTheme.colors.onSurface.copy(alpha = 0.5f),
                )
            }
            SyncStatus.SYNCING -> {
                CircularProgressIndicator(
                    modifier = Modifier.size(12.dp),
                    strokeWidth = 2.dp,
                    indicatorColor = ThresholdAccent,
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Syncing…",
                    fontSize = 11.sp,
                    color = MaterialTheme.colors.onSurface.copy(alpha = 0.5f),
                )
            }
            SyncStatus.OFFLINE -> {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFFFC107)),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Offline",
                    fontSize = 11.sp,
                    color = MaterialTheme.colors.onSurface.copy(alpha = 0.5f),
                )
            }
        }
    }
}

@Composable
private fun EmptyState(
    syncStatus: SyncStatus,
    onRefresh: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "⏰",
            fontSize = 32.sp,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "No alarms",
            fontSize = 16.sp,
            color = MaterialTheme.colors.onSurface.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(4.dp))

        if (syncStatus == SyncStatus.SYNCING) {
            CircularProgressIndicator(
                modifier = Modifier
                    .size(24.dp)
                    .padding(top = 8.dp),
                strokeWidth = 2.dp,
                indicatorColor = ThresholdAccent,
            )
        } else {
            Button(
                onClick = onRefresh,
                modifier = Modifier.padding(top = 8.dp),
                colors = ButtonDefaults.secondaryButtonColors(),
            ) {
                Text(
                    text = "Sync",
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun DeleteConfirmDialog(
    alarm: WatchAlarm,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    Alert(
        title = {
            Text(
                text = "Delete alarm?",
                textAlign = TextAlign.Center,
            )
        },
        negativeButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.secondaryButtonColors(),
            ) {
                Text("Cancel")
            }
        },
        positiveButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.primaryButtonColors(),
            ) {
                Text("Delete")
            }
        },
    ) {
        Text(
            text = "${alarm.timeDisplay} ${alarm.label}".trim(),
            textAlign = TextAlign.Center,
            fontSize = 14.sp,
        )
    }
}
