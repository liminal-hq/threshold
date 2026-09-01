// Generic, per-plugin durable queue for events published before Rust/the webview is up
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.nativebus

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "DurableEventQueue"

/**
 * A generic, reusable "queue events until Rust is up, then drain" log, backed by a single JSON array under one [KeyValueStore] key.
 *
 * Unlike [NativeEventBus], this is **not** a singleton -- each plugin that needs durable queuing instantiates its own `DurableEventQueue(store, prefsKey)` with a key distinct from every other plugin's, mirroring `WearSyncQueue`'s one-log-per-plugin shape (see `plugins/wear-sync/.../WearSyncQueue.kt`) rather than `AlarmManagerPlugin`'s older pattern of one separate queue per event *type* within a single plugin. One chronological log per plugin instance is enough: [drainAll] sorts by [Envelope.publishedAt] across every topic that instance has ever enqueued, so callers with several event kinds (the way `AlarmManagerPlugin` has fired/snooze/dismiss/import events today) don't need one `DurableEventQueue` per kind, just distinct `topic` strings on one instance.
 *
 * Persisted entries have survived across multiple days on real devices, so [drainAll] tolerates individual corrupt/malformed JSON entries (skips just that entry) and unrecognised/future [Envelope] schema versions (skips, doesn't crash) rather than failing the whole drain.
 */
class DurableEventQueue(
    private val store: KeyValueStore,
    private val prefsKey: String,
) {

    /** One persisted, drained event. */
    data class Envelope(
        val topic: String,
        val payload: String,
        val eventId: String,
        val publishedAt: Long,
        val handledNatively: Set<String>,
    )

    /**
     * Appends a new entry for [topic] with opaque, caller-defined [payload] JSON.
     *
     * @param handledNatively tags describing what native code already did with this event before it could be handed to Rust (e.g. "vibrated", "notified") -- carried through so a later Rust-side handler knows not to redo that work.
     * @return the generated event ID.
     */
    @Synchronized
    fun enqueue(topic: String, payload: String, handledNatively: Set<String> = emptySet()): String {
        val eventId = java.util.UUID.randomUUID().toString()
        val array = readArray()
        array.put(
            JSONObject().apply {
                put(KEY_VERSION, SCHEMA_VERSION)
                put(KEY_TOPIC, topic)
                put(KEY_PAYLOAD, payload)
                put(KEY_EVENT_ID, eventId)
                put(KEY_PUBLISHED_AT, System.currentTimeMillis())
                put(KEY_HANDLED_NATIVELY, JSONArray(handledNatively.toList()))
            },
        )
        writeArray(array)
        return eventId
    }

    /**
     * Returns every persisted entry across every topic, in chronological [Envelope.publishedAt] order, or an empty list if [pipelineReady] is `false`.
     *
     * This does not remove anything from the log -- call [commit] (or [clear]) once the caller has actually handed the drained entries off successfully, mirroring `WearSyncQueue`/`AlarmManagerPlugin`'s existing "only drop what was actually delivered" behaviour rather than assuming delivery always succeeds.
     */
    @Synchronized
    fun drainAll(pipelineReady: Boolean): List<Envelope> {
        if (!pipelineReady) return emptyList()
        return parseEnvelopes(readArray()).sortedBy { it.publishedAt }
    }

    /**
     * Removes only the entries whose event ID is in [handledEventIds], leaving everything else in place for a later retry -- mirrors `AlarmManagerPlugin`'s existing per-event-type drain, which re-persists whichever items failed to dispatch and drops only the ones that succeeded. Filters the *raw* persisted JSON by ID (via [extractEventId]) rather than reconstructing the array from [parseEnvelopes]'s output, so an entry that fails full parsing -- e.g. the unrecognised-schema-version case [drainAll] tolerates -- is retained untouched instead of being silently discarded just because it couldn't be committed by its own ID.
     */
    @Synchronized
    fun commit(handledEventIds: Set<String>) {
        if (handledEventIds.isEmpty()) return
        val original = readArray()
        val retained = JSONArray()
        for (i in 0 until original.length()) {
            val raw = original.opt(i)
            val eventId = (raw as? JSONObject)?.let { extractEventId(it) }
            if (eventId != null && eventId in handledEventIds) continue
            retained.put(raw)
        }
        writeArray(retained)
    }

    /**
     * Drops every persisted entry unconditionally -- mirrors `WearSyncQueue.drainAll`'s existing behaviour of clearing the whole log once its caller has taken ownership of every message it returned.
     */
    @Synchronized
    fun clear() {
        store.remove(prefsKey)
    }

    private fun readArray(): JSONArray {
        val raw = store.get(prefsKey) ?: return JSONArray()
        return try {
            JSONArray(raw)
        } catch (e: Exception) {
            Log.w(TAG, "Corrupt event queue JSON under key '$prefsKey', discarding it entirely", e)
            JSONArray()
        }
    }

    private fun writeArray(array: JSONArray) {
        store.set(prefsKey, array.toString())
    }

    private fun parseEnvelopes(array: JSONArray): List<Envelope> {
        val envelopes = mutableListOf<Envelope>()
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i)
            if (obj == null) {
                Log.w(TAG, "Skipping malformed queue entry at index $i (not a JSON object)")
                continue
            }
            val version = obj.optInt(KEY_VERSION, -1)
            if (version != SCHEMA_VERSION) {
                Log.w(TAG, "Skipping queue entry at index $i with unrecognised schema version $version")
                continue
            }
            try {
                envelopes.add(
                    Envelope(
                        topic = obj.getString(KEY_TOPIC),
                        payload = obj.getString(KEY_PAYLOAD),
                        eventId = obj.getString(KEY_EVENT_ID),
                        publishedAt = obj.getLong(KEY_PUBLISHED_AT),
                        handledNatively = parseHandledNatively(obj.optJSONArray(KEY_HANDLED_NATIVELY)),
                    ),
                )
            } catch (e: Exception) {
                Log.w(TAG, "Skipping malformed queue entry at index $i: ${e.message}")
            }
        }
        return envelopes
    }

    /**
     * Pulls just the [KEY_EVENT_ID] field out of a raw persisted entry, without requiring the rest of it to parse into a full [Envelope] -- this is what lets [commit] correctly retain an entry with an unrecognised schema version (or other malformed fields) instead of losing it, while still recognising its ID if that happens to be the one being committed.
     */
    private fun extractEventId(obj: JSONObject): String? {
        val id = obj.optString(KEY_EVENT_ID, "")
        return id.ifEmpty { null }
    }

    private fun parseHandledNatively(tags: JSONArray?): Set<String> {
        if (tags == null) return emptySet()
        val result = mutableSetOf<String>()
        for (i in 0 until tags.length()) {
            tags.optString(i, null)?.let { result.add(it) }
        }
        return result
    }

    companion object {
        const val SCHEMA_VERSION = 1

        private const val KEY_VERSION = "v"
        private const val KEY_TOPIC = "topic"
        private const val KEY_PAYLOAD = "payload"
        private const val KEY_EVENT_ID = "eventId"
        private const val KEY_PUBLISHED_AT = "publishedAt"
        private const val KEY_HANDLED_NATIVELY = "handledNatively"
    }
}
