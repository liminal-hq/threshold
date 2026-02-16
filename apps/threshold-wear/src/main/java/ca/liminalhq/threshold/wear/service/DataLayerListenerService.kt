package ca.liminalhq.threshold.wear.service

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

/**
 * Receives data changes and messages from the phone via the Wear Data Layer.
 *
 * This service is started automatically by Google Play Services when:
 * - A [DataItem] at [DATA_PATH_ALARMS] is updated (phone published alarm data)
 * - A message is received at any `/threshold/*` path
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
        Log.d(TAG, "Message received: ${messageEvent.path}")
        // Messages from the phone are handled here if needed.
        // Currently, the phone communicates via DataItems for alarm data.
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
