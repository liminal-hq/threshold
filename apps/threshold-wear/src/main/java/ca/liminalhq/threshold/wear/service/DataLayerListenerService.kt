// WearableListenerService — receives DataItem changes from the phone
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.service

import android.content.Intent
import android.os.Build
import android.util.Log
import ca.liminalhq.threshold.wear.ThresholdWearApp
import ca.liminalhq.threshold.wear.data.SyncStatus
import ca.liminalhq.threshold.wear.data.WatchAlarm
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "DataLayerListener"
private const val DATA_PATH_ALARMS = "/threshold/alarms"
private const val PATH_ALARM_RING = "/threshold/alarm_ring"

/**
 * Receives data changes and messages from the phone via the Wear Data Layer.
 *
 * This service is started automatically by Google Play Services when:
 * - A [DataItem] at [DATA_PATH_ALARMS] is updated (phone published alarm data)
 * - A message is received at any `/threshold/` path
 *
 * It parses the incoming data and updates the [AlarmRepository] so the
 * watch UI reflects the latest alarm state.
 */
class DataLayerListenerService : WearableListenerService() {

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        val app = application as? ThresholdWearApp ?: run {
            Log.e(TAG, "Application is not ThresholdWearApp")
            return
        }
        val repository = app.alarmRepository

        for (event in dataEvents) {
            if (event.type != DataEvent.TYPE_CHANGED) continue

            val dataItem = event.dataItem
            if (dataItem.uri.path != DATA_PATH_ALARMS) continue

            try {
                repository.setSyncStatus(SyncStatus.SYNCING)

                val dataMap = DataMapItem.fromDataItem(dataItem).dataMap
                val alarmsJson = dataMap.getString("alarmsJson") ?: continue
                val revision = dataMap.getLong("revision")

                Log.d(TAG, "Received alarm data at revision $revision")
                processSyncPayload(repository, alarmsJson, revision)

                repository.setSyncStatus(SyncStatus.CONNECTED)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to process alarm data", e)
                repository.setSyncStatus(SyncStatus.CONNECTED)
            }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        val path = messageEvent.path
        Log.d(TAG, "Message received: $path")

        when (path) {
            PATH_ALARM_RING -> handleAlarmRing(messageEvent)
            else -> Log.d(TAG, "Unhandled message path: $path")
        }
    }

    /**
     * Handle an alarm ring message from the phone — start the
     * [WearRingingService] which shows the ringing notification and UI.
     */
    private fun handleAlarmRing(messageEvent: MessageEvent) {
        try {
            val data = String(messageEvent.data, Charsets.UTF_8)
            val json = JSONObject(data)
            val alarmId = json.getInt("alarmId")
            val label = json.optString("label", "")
            val hour = json.optInt("hour", 0)
            val minute = json.optInt("minute", 0)
            val snoozeLength = json.optInt("snoozeLengthMinutes", 10)

            Log.d(TAG, "Alarm ring: id=$alarmId, $hour:$minute '$label'")

            val serviceIntent = Intent(this, WearRingingService::class.java).apply {
                putExtra(WearRingingService.EXTRA_ALARM_ID, alarmId)
                putExtra(WearRingingService.EXTRA_ALARM_LABEL, label)
                putExtra(WearRingingService.EXTRA_ALARM_HOUR, hour)
                putExtra(WearRingingService.EXTRA_ALARM_MINUTE, minute)
                putExtra(WearRingingService.EXTRA_SNOOZE_LENGTH, snoozeLength)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to handle alarm ring message", e)
        }
    }

    /**
     * Parse the sync payload and update the repository.
     *
     * The payload from the phone is JSON. It can be either:
     * - A JSON array of alarm IDs (batch publish — IDs only, triggering
     *   a sync request for full data)
     * - A JSON object with a "type" field indicating the sync response type
     *   (UpToDate, Incremental, or FullSync)
     */
    private fun processSyncPayload(
        repository: ca.liminalhq.threshold.wear.data.AlarmRepository,
        alarmsJson: String,
        revision: Long,
    ) {
        try {
            val root = JSONObject(alarmsJson)
            when (root.optString("type")) {
                "FullSync" -> {
                    val alarmsArray = root.getJSONArray("allAlarms")
                    val alarms = parseAlarmArray(alarmsArray)
                    repository.replaceAll(alarms, revision)
                }
                "Incremental" -> {
                    val updatedArray = root.getJSONArray("updatedAlarms")
                    val deletedArray = root.getJSONArray("deletedAlarmIds")
                    val updated = parseAlarmArray(updatedArray)
                    val deleted = (0 until deletedArray.length()).map { deletedArray.getInt(it) }
                    repository.applyIncremental(updated, deleted, revision)
                }
                "UpToDate" -> {
                    Log.d(TAG, "Already up to date at revision $revision")
                }
                else -> {
                    // If no type field, try parsing as a full alarm array
                    // (backwards compatibility with batch publishes)
                    val array = JSONArray(alarmsJson)
                    val alarms = parseAlarmArray(array)
                    if (alarms.isNotEmpty()) {
                        repository.replaceAll(alarms, revision)
                    }
                }
            }
        } catch (e: org.json.JSONException) {
            // Not a JSON object — try as a plain array
            try {
                val array = JSONArray(alarmsJson)
                val alarms = parseAlarmArray(array)
                if (alarms.isNotEmpty()) {
                    repository.replaceAll(alarms, revision)
                }
            } catch (e2: Exception) {
                Log.w(TAG, "Could not parse alarm payload: $alarmsJson", e2)
            }
        }
    }

    private fun parseAlarmArray(array: JSONArray): List<WatchAlarm> {
        return (0 until array.length()).mapNotNull { i ->
            try {
                WatchAlarm.fromJson(array.getJSONObject(i))
            } catch (e: Exception) {
                Log.w(TAG, "Failed to parse alarm at index $i", e)
                null
            }
        }
    }
}
