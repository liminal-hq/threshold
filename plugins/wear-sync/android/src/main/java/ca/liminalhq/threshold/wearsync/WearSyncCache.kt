// SharedPreferences cache — stores last-published alarm data for offline sync
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Context
import android.util.Log

private const val TAG = "WearSyncCache"
private const val PREFS_NAME = "ThresholdWearSync"
private const val KEY_ALARMS_JSON = "cached_alarms_json"
private const val KEY_REVISION = "cached_revision"

/**
 * Persistent cache of the last-published alarm sync payload.
 *
 * Written every time [WearSyncPlugin.publishToWatch] succeeds, read by
 * [WearMessageService] when a sync request arrives and the Tauri plugin
 * isn't loaded yet. This allows the phone to respond to watch sync
 * requests without booting the full Tauri runtime.
 *
 * The cache is always consistent because alarm changes can only happen
 * through the app (which writes the cache on every publish).
 */
object WearSyncCache {

    /**
     * Store the latest published alarm payload.
     *
     * @param context Android context for SharedPreferences access
     * @param alarmsJson The SyncResponse JSON string (FullSync envelope)
     * @param revision The phone's current revision at time of publish
     */
    fun write(context: Context, alarmsJson: String, revision: Long) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString(KEY_ALARMS_JSON, alarmsJson)
            putLong(KEY_REVISION, revision)
            apply()
        }
        Log.d(TAG, "Cached alarm data at revision $revision (${alarmsJson.length} bytes)")
    }

    /**
     * Read the cached alarm payload, if available.
     *
     * @param context Android context for SharedPreferences access
     * @return Pair of (alarmsJson, revision) or null if cache is empty
     */
    fun read(context: Context): Pair<String, Long>? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val json = prefs.getString(KEY_ALARMS_JSON, null) ?: return null
        val revision = prefs.getLong(KEY_REVISION, 0)
        return Pair(json, revision)
    }
}
