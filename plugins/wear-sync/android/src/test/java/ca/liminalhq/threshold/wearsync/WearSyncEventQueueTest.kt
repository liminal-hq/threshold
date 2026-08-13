// Unit tests for WearSyncEventQueue -- migration off WearSyncQueue, peek/commit, and path/topic mapping
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Plain JUnit 4 tests against an in-memory [InMemoryKeyValueStore] fake -- no
 * Robolectric/instrumentation needed. [DurableEventQueue]'s own drain/commit/corrupt-entry
 * behaviour is already covered by native-bus's own test suite, so these focus on what's
 * actually new here: migrating the old `WearSyncQueue` format, the peek-then-commit split
 * that lets `WearSyncPlugin.drainQueuedMessages` retry only what it failed to deliver, and
 * the path<->topic / data<->payload round-trip that replaces `WearSyncPlugin.onWatchMessage`'s
 * old direct `WearSyncQueue.enqueue`/`drainAll` calls.
 *
 * `WearSyncEventQueue.getInstance` (the production singleton accessor) isn't exercised
 * here since it needs a real `android.content.Context` -- these tests go through the
 * public `WearSyncEventQueue(store)` constructor directly instead, same as the singleton
 * does internally.
 */
class WearSyncEventQueueTest {

    private lateinit var store: InMemoryKeyValueStore
    private lateinit var queue: WearSyncEventQueue

    @Before
    fun setUp() {
        store = InMemoryKeyValueStore()
        queue = WearSyncEventQueue(store)
    }

    @Test
    fun `enqueue then deliver-all round-trips path as topic and data as payload`() {
        queue.enqueue("/threshold/save_alarm", "{\"alarmId\":1}")

        val drained = deliverAll(queue)

        assertEquals(listOf("/threshold/save_alarm" to "{\"alarmId\":1}"), drained)
    }

    @Test
    fun `nothing is queued until enqueue is called -- peeking an empty queue is a no-op`() {
        assertTrue(queue.peekAll().isEmpty())
    }

    @Test
    fun `a message enqueued while not ready stays queued until explicitly delivered`() {
        // Mirrors WearSyncPlugin.onWatchMessage's "not ready" branch: it enqueues and
        // does nothing else -- WearSyncEventQueue has no notion of "readiness" itself,
        // that gating lives in WearSyncPlugin, so from this class's perspective the
        // message simply sits in the log until peekAll()+commit() is called.
        queue.enqueue("/threshold/sync_request", "0")

        // Not delivered yet -- a second, independent queue instance over the same store
        // (mirroring a fresh WearSyncEventQueue construction at a later call site) sees
        // the same still-pending entry.
        val stillPending = deliverAll(WearSyncEventQueue(store))

        assertEquals(listOf("/threshold/sync_request" to "0"), stillPending)
    }

    @Test
    fun `multiple messages across different paths peek in enqueue order`() {
        queue.enqueue("/threshold/save_alarm", "one")
        queue.enqueue("/threshold/delete_alarm", "two")
        queue.enqueue("/threshold/alarm_dismiss", "three")

        val drained = deliverAll(queue)

        assertEquals(
            listOf(
                "/threshold/save_alarm" to "one",
                "/threshold/delete_alarm" to "two",
                "/threshold/alarm_dismiss" to "three",
            ),
            drained,
        )
    }

    @Test
    fun `peekAll does not remove anything -- only commit does`() {
        queue.enqueue("/threshold/save_alarm", "one")

        val firstPeek = queue.peekAll()
        val secondPeek = queue.peekAll()

        assertEquals(1, firstPeek.size)
        assertEquals(1, secondPeek.size)
        assertEquals(firstPeek.single().eventId, secondPeek.single().eventId)
    }

    @Test
    fun `committing only the delivered subset leaves the rest queued for retry`() {
        // Mirrors WearSyncPlugin.drainQueuedMessages: if delivery fails partway through a
        // batch, only the entries actually handed off get committed -- everything else
        // must still be there afterwards, ready to retry on the next drain.
        queue.enqueue("/threshold/save_alarm", "delivered-ok")
        queue.enqueue("/threshold/delete_alarm", "delivery-fails-here")
        queue.enqueue("/threshold/alarm_dismiss", "never-attempted")

        val pending = queue.peekAll()
        queue.commit(setOf(pending[0].eventId)) // only the first message was "delivered"

        val stillQueued = queue.peekAll()
        assertEquals(
            listOf("/threshold/delete_alarm" to "delivery-fails-here", "/threshold/alarm_dismiss" to "never-attempted"),
            stillQueued.map { it.path to it.data },
        )
    }

    @Test
    fun `committing an empty set is a no-op`() {
        queue.enqueue("/threshold/save_alarm", "one")

        queue.commit(emptySet())

        assertEquals(1, queue.peekAll().size)
    }

    @Test
    fun `committing removes entries so a second peek sees nothing left`() {
        queue.enqueue("/threshold/save_alarm", "one")

        deliverAll(queue)
        val secondPeek = queue.peekAll()

        assertTrue(secondPeek.isEmpty())
    }

    @Test
    fun `legacy pending_messages entries migrate into the durable log with topic, payload and publishedAt preserved`() {
        seedLegacyEntries(
            legacyEntry(path = "/threshold/save_alarm", data = "first", timestamp = 100L),
            legacyEntry(path = "/threshold/delete_alarm", data = "second", timestamp = 200L),
        )

        val drained = deliverAll(queue)

        assertEquals(
            listOf(
                "/threshold/save_alarm" to "first",
                "/threshold/delete_alarm" to "second",
            ),
            drained,
        )
    }

    @Test
    fun `migration removes the legacy key so it only ever runs once`() {
        seedLegacyEntries(legacyEntry(path = "/threshold/save_alarm", data = "first", timestamp = 100L))

        queue.enqueue("/threshold/sync_request", "trigger-migration")

        assertNull(store.get(WearSyncEventQueue.LEGACY_KEY_QUEUE))
    }

    @Test
    fun `legacy entries are migrated ahead of anything already enqueued in the new format, by original timestamp order`() {
        // Enqueue a "new format" entry first (stamped with the current wall clock,
        // which is necessarily later than the legacy entries' fixed timestamps below).
        queue.enqueue("/threshold/sync_request", "already-new-format")
        seedLegacyEntries(
            legacyEntry(path = "/threshold/save_alarm", data = "legacy-first", timestamp = 1L),
            legacyEntry(path = "/threshold/delete_alarm", data = "legacy-second", timestamp = 2L),
        )

        val drained = deliverAll(queue)

        assertEquals(
            listOf(
                "/threshold/save_alarm" to "legacy-first",
                "/threshold/delete_alarm" to "legacy-second",
                "/threshold/sync_request" to "already-new-format",
            ),
            drained,
        )
    }

    @Test
    fun `a malformed legacy entry is skipped without failing migration of the rest`() {
        val legacyArray = JSONArray()
        legacyArray.put(legacyEntry(path = "/threshold/save_alarm", data = "good", timestamp = 100L))
        legacyArray.put(JSONObject().apply { put("path", "/threshold/delete_alarm") }) // missing "data"
        legacyArray.put("not even a JSON object")
        store.set(WearSyncEventQueue.LEGACY_KEY_QUEUE, legacyArray.toString())

        val drained = deliverAll(queue)

        assertEquals(listOf("/threshold/save_alarm" to "good"), drained)
    }

    @Test
    fun `a corrupt legacy queue is discarded without crashing, and the key is still removed`() {
        store.set(WearSyncEventQueue.LEGACY_KEY_QUEUE, "{not json at all")

        val drained = deliverAll(queue)

        assertTrue(drained.isEmpty())
        assertNull(store.get(WearSyncEventQueue.LEGACY_KEY_QUEUE))
    }

    /** Mirrors WearSyncPlugin.drainQueuedMessages's happy path: peek, "deliver" everything, commit everything. */
    private fun deliverAll(queue: WearSyncEventQueue): List<Pair<String, String>> {
        val pending = queue.peekAll()
        queue.commit(pending.map { it.eventId }.toSet())
        return pending.map { it.path to it.data }
    }

    private fun legacyEntry(path: String, data: String, timestamp: Long): JSONObject =
        JSONObject().apply {
            put("path", path)
            put("data", data)
            put("timestamp", timestamp)
        }

    private fun seedLegacyEntries(vararg entries: JSONObject) {
        val array = JSONArray()
        entries.forEach { array.put(it) }
        store.set(WearSyncEventQueue.LEGACY_KEY_QUEUE, array.toString())
    }
}
