// SharedPreferences queue — stores watch messages for deferred processing
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "WearSyncQueue"
private const val PREFS_NAME = "ThresholdWearSyncQueue"
private const val KEY_QUEUE = "pending_messages"

/**
 * Persistent queue for watch messages that arrive when the Tauri plugin
 * isn't loaded (app is closed).
 *
 * Messages are enqueued by [WearSyncService] and drained by
 * [WearSyncPlugin] when the plugin loads and the Channel is registered.
 */
object WearSyncQueue {

    /** Add a message to the queue. */
    fun enqueue(context: Context, path: String, data: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val array = loadArray(prefs.getString(KEY_QUEUE, null))

        val entry = JSONObject().apply {
            put("path", path)
            put("data", data)
            put("timestamp", System.currentTimeMillis())
        }
        array.put(entry)

        prefs.edit().putString(KEY_QUEUE, array.toString()).apply()
        Log.d(TAG, "Enqueued message: path=$path (queue size: ${array.length()})")
    }

    /** Drain all queued messages and clear the queue. Returns list of (path, data) pairs. */
    fun drainAll(context: Context): List<Pair<String, String>> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val array = loadArray(prefs.getString(KEY_QUEUE, null))

        if (array.length() == 0) return emptyList()

        val messages = mutableListOf<Pair<String, String>>()
        for (i in 0 until array.length()) {
            try {
                val obj = array.getJSONObject(i)
                messages.add(Pair(obj.getString("path"), obj.getString("data")))
            } catch (e: Exception) {
                Log.w(TAG, "Failed to parse queued message at index $i", e)
            }
        }

        prefs.edit().remove(KEY_QUEUE).apply()
        Log.d(TAG, "Drained ${messages.size} queued message(s)")
        return messages
    }

    private fun loadArray(json: String?): JSONArray {
        if (json == null) return JSONArray()
        return try {
            JSONArray(json)
        } catch (e: Exception) {
            JSONArray()
        }
    }
}
