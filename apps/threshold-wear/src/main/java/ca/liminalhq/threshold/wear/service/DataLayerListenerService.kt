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
import ca.liminalhq.threshold.wear.presentation.RingingActivity
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

private const val TAG = "DataLayerListener"
private const val DATA_PATH_ALARMS = "/threshold/alarms"
private const val PATH_ALARM_RING = "/threshold/alarm_ring"
private const val PATH_ALARM_DISMISS = "/threshold/alarm_dismiss"
private const val PATH_ALARM_SNOOZE = "/threshold/alarm_snooze"

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

            repository.setSyncStatus(SyncStatus.SYNCING)
            try {
                val dataMap = DataMapItem.fromDataItem(dataItem).dataMap
                val alarmsJson = dataMap.getString("alarmsJson")
                if (alarmsJson == null) {
                    Log.w(TAG, "Data item at $DATA_PATH_ALARMS is missing alarmsJson — skipping")
                    continue
                }
                val revision = dataMap.getLong("revision")

                // Persist snooze length from phone settings so the watch
                // always uses the latest value (fallback alarms, ringing UI)
                val snoozeLengthMinutes = dataMap.getInt("snoozeLengthMinutes", 10)
                val is24HourKnown = dataMap.getBoolean("is24HourKnown", false)
                val editor = applicationContext
                    .getSharedPreferences("threshold_wear", android.content.Context.MODE_PRIVATE)
                    .edit()
                    .putInt("snooze_length_minutes", snoozeLengthMinutes)
                    .putBoolean("is_24_hour_known", is24HourKnown)
                var loggedIs24Hour = "unknown"
                if (is24HourKnown && dataMap.containsKey("is24Hour")) {
                    val is24Hour = dataMap.getBoolean("is24Hour")
                    editor.putBoolean("is_24_hour", is24Hour)
                    loggedIs24Hour = is24Hour.toString()
                }
                editor.apply()

                Log.d(TAG, "Received alarm data at revision $revision, snooze=${snoozeLengthMinutes}m, is24h=$loggedIs24Hour, is24hKnown=$is24HourKnown")
                processSyncPayload(repository, alarmsJson, revision)

                // Re-evaluate fallback alarm scheduling after sync
                app.connectionMonitor.onAlarmsUpdated()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to process alarm data", e)
            } finally {
                // Always resolve the sync status on every exit path from this
                // per-event block — success, the early `continue` above on a
                // malformed data item, or an exception — so a bad payload can
                // never strand the UI on "Syncing…" (issue #158).
                repository.setSyncStatus(SyncStatus.CONNECTED)
            }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        val path = messageEvent.path
        Log.d(TAG, "Message received: $path")

        when (path) {
            PATH_ALARM_RING -> handleAlarmRing(messageEvent)
            PATH_ALARM_DISMISS -> handleAlarmDismiss(messageEvent)
            PATH_ALARM_SNOOZE -> handleAlarmSnooze(messageEvent)
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

            // Deduplication: skip if this alarm is already ringing
            if (WearRingingService.ringingAlarmId == alarmId) {
                Log.d(TAG, "Alarm $alarmId already ringing — ignoring duplicate ring message")
                return
            }
            val label = json.optString("label", "")
            val hour = json.optInt("hour", 0)
            val minute = json.optInt("minute", 0)
            val snoozeLength = json.optInt("snoozeLengthMinutes", 10)
            val is24HourKnown = json.optBoolean("is24HourKnown", false)
            val is24Hour = if (json.has("is24Hour")) json.optBoolean("is24Hour", false) else null

            Log.d(TAG, "Alarm ring: id=$alarmId, $hour:$minute '$label' snooze=${snoozeLength}m is24h=${is24Hour ?: "unknown"} is24hKnown=$is24HourKnown")

            // Persist snooze length so fallback alarms use the phone's setting
            val prefsEditor = applicationContext
                .getSharedPreferences("threshold_wear", android.content.Context.MODE_PRIVATE)
                .edit()
                .putInt("snooze_length_minutes", snoozeLength)
                .putBoolean("is_24_hour_known", is24HourKnown)
            if (is24HourKnown && is24Hour != null) {
                prefsEditor.putBoolean("is_24_hour", is24Hour)
            }
            prefsEditor.apply()

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
     * Handle an alarm dismiss message from the phone — stop watch ringing.
     */
    private fun handleAlarmDismiss(messageEvent: MessageEvent) {
        try {
            val data = String(messageEvent.data, Charsets.UTF_8)
            val json = JSONObject(data)
            val alarmId = json.optInt("alarmId", -1)
            Log.d(TAG, "Alarm dismiss: id=$alarmId")

            stopRingingOnWatch(WearRingingService.ACTION_DISMISS, alarmId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to handle alarm dismiss message", e)
        }
    }

    /**
     * Handle an alarm snooze message from the phone — stop watch ringing.
     */
    private fun handleAlarmSnooze(messageEvent: MessageEvent) {
        try {
            val data = String(messageEvent.data, Charsets.UTF_8)
            val json = JSONObject(data)
            val alarmId = json.optInt("alarmId", -1)
            val snoozeLengthMinutes = json.optInt("snoozeLengthMinutes", 10)
            Log.d(TAG, "Alarm snooze: id=$alarmId, snooze=${snoozeLengthMinutes}m")

            stopRingingOnWatch(WearRingingService.ACTION_SNOOZE, alarmId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to handle alarm snooze message", e)
        }
    }

    private fun stopRingingOnWatch(action: String, alarmId: Int) {
        if (WearRingingService.ringingAlarmId == -1) {
            Log.d(TAG, "Ignoring $action for alarm $alarmId because no alarm is currently ringing")
            return
        }

        if (alarmId != -1 && WearRingingService.ringingAlarmId != alarmId) {
            Log.d(
                TAG,
                "Ignoring $action for alarm $alarmId while alarm ${WearRingingService.ringingAlarmId} is ringing",
            )
            return
        }

        val serviceIntent = Intent(this, WearRingingService::class.java).apply {
            this.action = action
            putExtra(WearRingingService.EXTRA_ALARM_ID, alarmId)
        }
        startService(serviceIntent)

        // Ensure the full-screen ringing activity is dismissed as well.
        val closeUiIntent = Intent(this, RingingActivity::class.java).apply {
            this.action = RingingActivity.ACTION_CLOSE_RINGING
            putExtra(WearRingingService.EXTRA_ALARM_ID, alarmId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        try {
            startActivity(closeUiIntent)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to close ringing activity for action $action", e)
        }
    }

    /**
     * Parse the sync payload and update the repository based on the resulting
     * [SyncAction]. See [parseSyncPayload] for the parsing rules themselves.
     */
    private fun processSyncPayload(
        repository: ca.liminalhq.threshold.wear.data.AlarmRepository,
        alarmsJson: String,
        revision: Long,
    ) {
        when (val action = parseSyncPayload(alarmsJson)) {
            is SyncAction.ReplaceAll -> repository.replaceAll(action.alarms, revision)
            is SyncAction.ApplyIncremental ->
                repository.applyIncremental(action.updatedAlarms, action.deletedAlarmIds, revision)
            SyncAction.UpToDate -> Log.d(TAG, "Already up to date at revision $revision")
            is SyncAction.ParseFailure ->
                Log.w(TAG, "Could not parse alarm payload: $alarmsJson", action.error)
        }
    }
}

/**
 * The repository action a sync payload from the phone resolves to. Kept separate
 * from [AlarmRepository] and [Log] calls so [parseSyncPayload] can be unit-tested
 * without the Android framework.
 */
internal sealed class SyncAction {
    data class ReplaceAll(val alarms: List<WatchAlarm>) : SyncAction()
    data class ApplyIncremental(
        val updatedAlarms: List<WatchAlarm>,
        val deletedAlarmIds: List<Int>,
    ) : SyncAction()
    object UpToDate : SyncAction()
    data class ParseFailure(val error: Exception) : SyncAction()
}

/**
 * Parse a sync payload from the phone into a [SyncAction].
 *
 * The payload is JSON and can be either:
 * - A JSON object with a "type" field indicating the sync response type
 *   (FullSync, Incremental, or UpToDate)
 * - A plain JSON array of alarms (legacy backwards compatibility with batch
 *   publishes that predate the typed envelope) — including an *empty* array,
 *   which is a valid, intentional "clear all alarms" signal and must still
 *   reach [SyncAction.ReplaceAll] rather than being silently dropped.
 */
internal fun parseSyncPayload(alarmsJson: String): SyncAction {
    return try {
        val root = JSONObject(alarmsJson)
        when (root.optString("type")) {
            "FullSync" -> SyncAction.ReplaceAll(parseAlarmArray(root.getJSONArray("allAlarms")))
            "Incremental" -> {
                val deletedArray = root.getJSONArray("deletedAlarmIds")
                SyncAction.ApplyIncremental(
                    updatedAlarms = parseAlarmArray(root.getJSONArray("updatedAlarms")),
                    deletedAlarmIds = (0 until deletedArray.length()).map { deletedArray.getInt(it) },
                )
            }
            "UpToDate" -> SyncAction.UpToDate
            else -> {
                // A JSON object with no recognized "type" field isn't a shape we
                // understand. This can't be the legacy plain-array format -- that's
                // handled below, once JSONObject(alarmsJson) has already failed --
                // so report it directly rather than attempting a JSONArray parse
                // that can only ever throw on an already-confirmed JSON object.
                SyncAction.ParseFailure(
                    JSONException("Unrecognized sync payload type: ${root.optString("type")}"),
                )
            }
        }
    } catch (e: JSONException) {
        // Not a JSON object at all — legacy plain array format.
        try {
            SyncAction.ReplaceAll(parseAlarmArray(JSONArray(alarmsJson)))
        } catch (e2: Exception) {
            SyncAction.ParseFailure(e2)
        }
    }
}

/** Parse a JSON array of alarm objects, skipping entries that fail to parse. */
internal fun parseAlarmArray(array: JSONArray): List<WatchAlarm> {
    return (0 until array.length()).mapNotNull { i ->
        try {
            WatchAlarm.fromJson(array.getJSONObject(i))
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse alarm at index $i", e)
            null
        }
    }
}
