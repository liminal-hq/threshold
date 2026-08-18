// Durable queue for watch messages, backed by native-bus's shared DurableEventQueue log
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Context
import android.util.Log
import ca.liminalhq.threshold.nativebus.DurableEventQueue
import ca.liminalhq.threshold.nativebus.KeyValueStore
import ca.liminalhq.threshold.nativebus.SharedPreferencesKeyValueStore
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "WearSyncEventQueue"

/**
 * Persistent queue for watch messages that arrive when the Tauri plugin isn't loaded (app is closed), backed by the shared [DurableEventQueue] log instead of the bespoke SharedPreferences format the old `WearSyncQueue` used.
 *
 * Messages are enqueued by [WearMessageService] (offline path) and [WearSyncPlugin] (every path, per [WearSyncPlugin.onWatchMessage]'s "enqueue, then drain immediately if ready" flow), and drained by [WearSyncPlugin] once its Channel is registered and the pipeline is marked ready. Each Play Services message path (e.g. `/threshold/save_alarm`) becomes the [DurableEventQueue] topic; the raw message string becomes its opaque payload.
 *
 * [context] is only used for [android.content.Context]-scoped diagnostics (mirroring [NativeEventLog]'s calls the old `WearSyncQueue` made) -- it's nullable so tests can construct this class against an in-memory [KeyValueStore] fake without any Android framework available.
 */
class WearSyncEventQueue(private val store: KeyValueStore, private val context: Context? = null) {

    private val delegate = DurableEventQueue(store, KEY_QUEUE)

    /**
     * Guards the migration check-then-act sequence in [migrateLegacyEntriesIfNeeded] together with every delegated operation below, so a concurrent caller can never observe (or run concurrently with) a partially-applied migration. [DurableEventQueue]'s own methods are `@Synchronized` on itself, which is enough to serialize *those* calls against each other, but [migrateLegacyEntriesIfNeeded] reads and writes [store] directly under the same [KEY_QUEUE] key -- entirely bypassing that lock -- so without this shared monitor two callers (e.g. [WearMessageService] and [WearSyncPlugin], both going through the singleton this class instance backs) could each pass the "has legacy entries" check before either writes back, and the second migration write would silently clobber whatever the other caller enqueued in between.
     */
    private val lock = Any()

    /** One not-yet-committed queued message, as returned by [peekAll]. */
    data class QueuedMessage(val eventId: String, val path: String, val data: String)

    /** Add a message to the queue. */
    fun enqueue(path: String, data: String) {
        synchronized(lock) {
            migrateLegacyEntriesIfNeeded()
            delegate.enqueue(topic = path, payload = data)
        }
        Log.d(TAG, "Enqueued message: path=$path")
        logToFile("Enqueued message path=$path")
    }

    /**
     * Returns every currently-queued message, oldest first, **without** removing anything from the log -- callers must call [commit] with the IDs of whichever entries they actually finished delivering. This peek-then-commit split (mirroring [DurableEventQueue.drainAll]/[DurableEventQueue.commit]'s own design) exists so a delivery failure partway through a batch (e.g. a stale Channel throwing) only drops the entries that failed to deliver -- not every entry that happened to be queued alongside them.
     */
    fun peekAll(): List<QueuedMessage> {
        synchronized(lock) {
            migrateLegacyEntriesIfNeeded()
            return delegate.drainAll(pipelineReady = true).map { QueuedMessage(it.eventId, it.topic, it.payload) }
        }
    }

    /** Removes only the given [eventIds] (as returned by [peekAll]) from the queue. */
    fun commit(eventIds: Set<String>) {
        if (eventIds.isEmpty()) return
        synchronized(lock) { delegate.commit(eventIds) }
        Log.d(TAG, "Drained ${eventIds.size} queued message(s)")
        logToFile("Drained ${eventIds.size} queued message(s)")
    }

    /**
     * One-time migration of leftover entries from the old `WearSyncQueue`'s bespoke format (a raw JSON array of `{path, data, timestamp}` under [LEGACY_KEY_QUEUE] in this same [store]) into the shared [DurableEventQueue] log, then removes the old key. A no-op once migrated, since [LEGACY_KEY_QUEUE] is gone afterwards.
     *
     * This writes envelope JSON directly (mirroring [DurableEventQueue]'s own persisted field names -- the same approach its own test suite uses to pin `publishedAt` deterministically) rather than going through [DurableEventQueue.enqueue], because that method always stamps the current wall-clock time and has no way to accept the legacy entry's original timestamp, which this migration must preserve.
     *
     * One-way: an app downgrade after this ships would strand any migrated (or newly enqueued) entries, since the old build only ever reads [LEGACY_KEY_QUEUE].
     *
     * Callers must hold [lock] for the full check-then-act sequence (see its KDoc) -- this method itself performs no locking of its own.
     */
    private fun migrateLegacyEntriesIfNeeded() {
        val legacyRaw = store.get(LEGACY_KEY_QUEUE) ?: return

        val legacyArray = try {
            JSONArray(legacyRaw)
        } catch (e: Exception) {
            Log.w(TAG, "Corrupt legacy queue JSON under '$LEGACY_KEY_QUEUE', discarding without migrating", e)
            logToFile("Corrupt legacy queue JSON, discarding without migrating: ${e.message}")
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

        // Written as one atomic batch rather than a separate set() + remove(): if the process died between those two calls, the next launch would see the new log already holding these entries but LEGACY_KEY_QUEUE still present with its original data, re-run this migration, and enqueue every legacy entry a second time (with fresh event IDs) -- delivering the same watch action twice. Batching makes that intermediate state unobservable -- either both the log write and the legacy-key removal land, or neither does. Mirrors AlarmManagerPlugin.migrateLegacyQueues's identical fix for the same class of bug.
        store.batch(sets = mapOf(KEY_QUEUE to migratedArray.toString()), removes = setOf(LEGACY_KEY_QUEUE))
        Log.i(TAG, "Migrated $migrated legacy watch message(s) into the durable event queue")
        logToFile("Migrated $migrated legacy watch message(s) into the durable event queue")
    }

    /** Mirrors the old `WearSyncQueue`'s [NativeEventLog] calls, so field-exported logs still see queue activity. */
    private fun logToFile(message: String) {
        context?.let { NativeEventLog.log(it, TAG, message) }
    }

    companion object {
        /** Shared SharedPreferences file name the production singleton points its [KeyValueStore] at. */
        const val PREFS_NAME = "ThresholdWearSyncQueue"

        private const val KEY_QUEUE = "durable_log"

        /** Key of the old `WearSyncQueue`'s bespoke queue format, migrated away from on first use. */
        const val LEGACY_KEY_QUEUE = "pending_messages"

        // Mirrors DurableEventQueue's own persisted field names (see its Envelope KDoc). Duplicated here only because the migration above must write entries with a caller-supplied publishedAt, which DurableEventQueue.enqueue() doesn't support.
        private const val KEY_VERSION = "v"
        private const val KEY_TOPIC = "topic"
        private const val KEY_PAYLOAD = "payload"
        private const val KEY_EVENT_ID = "eventId"
        private const val KEY_PUBLISHED_AT = "publishedAt"
        private const val KEY_HANDLED_NATIVELY = "handledNatively"

        @Volatile
        private var instance: WearSyncEventQueue? = null

        /**
         * Returns the process-wide singleton pointed at the production SharedPreferences file, constructing it on first access.
         *
         * [WearSyncPlugin] and [WearMessageService] **must** both go through this rather than constructing their own `WearSyncEventQueue(SharedPreferencesKeyValueStore(...))` directly -- two independently-constructed instances pointed at the same underlying file provide *no* mutual exclusion between each other, since [DurableEventQueue]'s `@Synchronized` methods only lock their own instance's monitor. A watch message arriving through each of those two call sites at nearly the same moment, each against its own instance, could race: both read the same pre-write JSON array, each append their own entry, and the second write clobbers the first. Going through one shared instance closes that gap.
         *
         * Test code should keep constructing this class directly against an in-memory [KeyValueStore] fake instead of going through this accessor.
         */
        fun getInstance(context: Context): WearSyncEventQueue {
            return instance ?: synchronized(this) {
                instance ?: WearSyncEventQueue(
                    SharedPreferencesKeyValueStore(context.applicationContext, PREFS_NAME),
                    context.applicationContext,
                ).also { instance = it }
            }
        }
    }
}
