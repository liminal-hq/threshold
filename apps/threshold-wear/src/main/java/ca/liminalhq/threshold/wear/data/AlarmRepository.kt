package ca.liminalhq.threshold.wear.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "AlarmRepository"
private const val PREFS_NAME = "threshold_wear"
private const val KEY_ALARMS = "alarms_json"
private const val KEY_REVISION = "last_sync_revision"

/**
 * Local cache of alarm data on the watch.
 *
 * Provides observable [StateFlow] properties for Compose UI to collect.
 * Data is persisted to [SharedPreferences] so it survives process restarts.
 * The [DataLayerListenerService] updates this repository when sync data
 * arrives from the phone.
 */
class AlarmRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _alarms = MutableStateFlow<List<WatchAlarm>>(emptyList())
    val alarms: StateFlow<List<WatchAlarm>> = _alarms.asStateFlow()

    private val _syncStatus = MutableStateFlow(SyncStatus.OFFLINE)
    val syncStatus: StateFlow<SyncStatus> = _syncStatus.asStateFlow()

    private val _revision = MutableStateFlow(0L)
    val revision: StateFlow<Long> = _revision.asStateFlow()

    init {
        loadFromPrefs()
    }

    /** Replace the entire alarm list (used for full sync). */
    fun replaceAll(alarms: List<WatchAlarm>, revision: Long) {
        _alarms.value = alarms.sortedBy { it.hour * 60 + it.minute }
        _revision.value = revision
        saveToPrefs()
        Log.d(TAG, "Full sync: ${alarms.size} alarm(s) at revision $revision")
    }

    /** Apply incremental updates: upsert changed alarms, remove deleted ones. */
    fun applyIncremental(
        updatedAlarms: List<WatchAlarm>,
        deletedIds: List<Int>,
        revision: Long,
    ) {
        val current = _alarms.value.toMutableList()

        // Remove deleted alarms
        current.removeAll { it.id in deletedIds }

        // Upsert updated alarms
        for (alarm in updatedAlarms) {
            val index = current.indexOfFirst { it.id == alarm.id }
            if (index >= 0) {
                current[index] = alarm
            } else {
                current.add(alarm)
            }
        }

        _alarms.value = current.sortedBy { it.hour * 60 + it.minute }
        _revision.value = revision
        saveToPrefs()
        Log.d(
            TAG,
            "Incremental sync: ${updatedAlarms.size} updated, ${deletedIds.size} deleted, revision $revision"
        )
    }

    /** Update the sync status indicator. */
    fun setSyncStatus(status: SyncStatus) {
        _syncStatus.value = status
    }

    /** Get the last known sync revision for requesting incremental syncs. */
    fun getLastRevision(): Long = _revision.value

    private fun loadFromPrefs() {
        val json = prefs.getString(KEY_ALARMS, null) ?: return
        try {
            val array = JSONArray(json)
            val alarms = (0 until array.length()).map {
                WatchAlarm.fromJson(array.getJSONObject(it))
            }
            _alarms.value = alarms.sortedBy { it.hour * 60 + it.minute }
            _revision.value = prefs.getLong(KEY_REVISION, 0)
            Log.d(TAG, "Loaded ${alarms.size} alarm(s) from cache at revision ${_revision.value}")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load cached alarms", e)
        }
    }

    private fun saveToPrefs() {
        val array = JSONArray()
        for (alarm in _alarms.value) {
            array.put(alarm.toJson())
        }
        prefs.edit()
            .putString(KEY_ALARMS, array.toString())
            .putLong(KEY_REVISION, _revision.value)
            .apply()
    }
}
