// Durable queue for watch messages, backed by native-bus's shared DurableEventQueue log
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.util.Log
import ca.liminalhq.threshold.nativebus.DurableEventQueue
import ca.liminalhq.threshold.nativebus.KeyValueStore
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "WearSyncEventQueue"

/**
 * Persistent queue for watch messages that arrive when the Tauri plugin isn't loaded
 * (app is closed), backed by the shared [DurableEventQueue] log instead of the bespoke
 * SharedPreferences format the old `WearSyncQueue` used.
 *
 * Messages are enqueued by [WearMessageService] (offline path) and [WearSyncPlugin]
 * (every path, per [WearSyncPlugin.onWatchMessage]'s "enqueue, then drain immediately if
 * ready" flow), and drained by [WearSyncPlugin] once its Channel is registered and the
 * pipeline is marked ready. Each Play Services message path (e.g.
 * `/threshold/save_alarm`) becomes the [DurableEventQueue] topic; the raw message string
 * becomes its opaque payload.
 *
 * Both call sites construct their own instance against a [store] pointed at the same
 * SharedPreferences file/key rather than sharing one Kotlin object -- persistence is the
 * source of truth, not instance state, mirroring the old `WearSyncQueue`'s per-call
 * `context.getSharedPreferences(...)` construction.
 */
class WearSyncEventQueue(private val store: KeyValueStore) {

    private val delegate = DurableEventQueue(store, KEY_QUEUE)

    /** Add a message to the queue. */
    fun enqueue(path: String, data: String) {
        migrateLegacyEntriesIfNeeded()
        delegate.enqueue(topic = path, payload = data)
        Log.d(TAG, "Enqueued message: path=$path")
    }

    /** Drain and remove every queued message, returning (path, data) pairs oldest first. */
    fun drainAll(): List<Pair<String, String>> {
        migrateLegacyEntriesIfNeeded()
        val envelopes = delegate.drainAll(pipelineReady = true)
        if (envelopes.isEmpty()) return emptyList()

        delegate.commit(envelopes.map { it.eventId }.toSet())
        Log.d(TAG, "Drained ${envelopes.size} queued message(s)")
        return envelopes.map { it.topic to it.payload }
    }

    /**
     * One-time migration of leftover entries from the old `WearSyncQueue`'s bespoke
     * format (a raw JSON array of `{path, data, timestamp}` under [LEGACY_KEY_QUEUE] in
     * this same [store]) into the shared [DurableEventQueue] log, then removes the old
     * key. A no-op once migrated, since [LEGACY_KEY_QUEUE] is gone afterwards.
     *
     * This writes envelope JSON directly (mirroring [DurableEventQueue]'s own persisted
     * field names -- the same approach its own test suite uses to pin `publishedAt`
     * deterministically) rather than going through [DurableEventQueue.enqueue], because
     * that method always stamps the current wall-clock time and has no way to accept the
     * legacy entry's original timestamp, which this migration must preserve.
     *
     * One-way: an app downgrade after this ships would strand any migrated (or newly
     * enqueued) entries, since the old build only ever reads [LEGACY_KEY_QUEUE].
     */
    private fun migrateLegacyEntriesIfNeeded() {
        val legacyRaw = store.get(LEGACY_KEY_QUEUE) ?: return

        val legacyArray = try {
            JSONArray(legacyRaw)
        } catch (e: Exception) {
            Log.w(TAG, "Corrupt legacy queue JSON under '$LEGACY_KEY_QUEUE', discarding without migrating", e)
            store.remove(LEGACY_KEY_QUEUE)
            return
        }

        val migratedArray = try {
            store.get(KEY_QUEUE)?.let { JSONArray(it) } ?: JSONArray()
        } catch (e: Exception) {
            JSONArray()
        }

        var migrated = 0
        for (i in 0 until legacyArray.length()) {
            val entry = legacyArray.optJSONObject(i)
            if (entry == null) {
                Log.w(TAG, "Skipping malformed legacy queue entry at index $i (not a JSON object)")
                continue
            }
            try {
                migratedArray.put(
                    JSONObject().apply {
                        put(KEY_VERSION, DurableEventQueue.SCHEMA_VERSION)
                        put(KEY_TOPIC, entry.getString("path"))
                        put(KEY_PAYLOAD, entry.getString("data"))
                        put(KEY_EVENT_ID, java.util.UUID.randomUUID().toString())
                        put(KEY_PUBLISHED_AT, entry.optLong("timestamp", System.currentTimeMillis()))
                        put(KEY_HANDLED_NATIVELY, JSONArray())
                    },
                )
                migrated++
            } catch (e: Exception) {
                Log.w(TAG, "Skipping malformed legacy queue entry at index $i: ${e.message}")
            }
        }

        store.set(KEY_QUEUE, migratedArray.toString())
        store.remove(LEGACY_KEY_QUEUE)
        Log.i(TAG, "Migrated $migrated legacy watch message(s) into the durable event queue")
    }

    companion object {
        /** Shared SharedPreferences file name both call sites point their [KeyValueStore] at. */
        const val PREFS_NAME = "ThresholdWearSyncQueue"

        private const val KEY_QUEUE = "durable_log"

        /** Key of the old `WearSyncQueue`'s bespoke queue format, migrated away from on first use. */
        const val LEGACY_KEY_QUEUE = "pending_messages"

        // Mirrors DurableEventQueue's own persisted field names (see its Envelope KDoc).
        // Duplicated here only because the migration above must write entries with a
        // caller-supplied publishedAt, which DurableEventQueue.enqueue() doesn't support.
        private const val KEY_VERSION = "v"
        private const val KEY_TOPIC = "topic"
        private const val KEY_PAYLOAD = "payload"
        private const val KEY_EVENT_ID = "eventId"
        private const val KEY_PUBLISHED_AT = "publishedAt"
        private const val KEY_HANDLED_NATIVELY = "handledNatively"
    }
}
