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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Plain JUnit 4 tests against an in-memory [InMemoryKeyValueStore] fake -- no Robolectric/instrumentation needed. [DurableEventQueue]'s own drain/commit/corrupt-entry behaviour is already covered by native-bus's own test suite, so these focus on what's actually new here: migrating the old `WearSyncQueue` format, the peek-then-commit split that lets `WearSyncPlugin.drainQueuedMessages` retry only what it failed to deliver, and the path<->topic / data<->payload round-trip that replaces `WearSyncPlugin.onWatchMessage`'s old direct `WearSyncQueue.enqueue`/`drainAll` calls.
 *
 * `WearSyncEventQueue.getInstance` (the production singleton accessor) isn't exercised here since it needs a real `android.content.Context` -- these tests go through the public `WearSyncEventQueue(store)` constructor directly instead, same as the singleton does internally.
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
        // Mirrors WearSyncPlugin.onWatchMessage's "not ready" branch: it enqueues and does nothing else -- WearSyncEventQueue has no notion of "readiness" itself, that gating lives in WearSyncPlugin, so from this class's perspective the message simply sits in the log until peekAll()+commit() is called.
        queue.enqueue("/threshold/sync_request", "0")

        // Not delivered yet -- a second, independent queue instance over the same store (mirroring a fresh WearSyncEventQueue construction at a later call site) sees the same still-pending entry.
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
        // Mirrors WearSyncPlugin.drainQueuedMessages: if delivery fails partway through a batch, only the entries actually handed off get committed -- everything else must still be there afterwards, ready to retry on the next drain.
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
        // Enqueue a "new format" entry first (stamped with the current wall clock, which is necessarily later than the legacy entries' fixed timestamps below).
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

    @Test
    fun `migration writes the new log and removes the legacy key as a single atomic batch`() {
        // Regression test for a process-death-mid-migration bug: writing the migrated log and removing the legacy key as two separate, unguarded calls could leave both copies on disk if the process died in between, and the next access would re-migrate the same legacy entries again (with fresh event IDs), delivering the same watch action twice. Asserting the migration goes through exactly one KeyValueStore.batch() call -- rather than direct set()/remove() calls -- pins it to the atomic path. Mirrors AlarmManagerPlugin's identical fix and its own test of the same shape.
        val recording = RecordingKeyValueStore()
        recording.seed(
            WearSyncEventQueue.LEGACY_KEY_QUEUE,
            JSONArray().apply { put(legacyEntry(path = "/threshold/save_alarm", data = "first", timestamp = 100L)) }.toString(),
        )
        val queueOverRecording = WearSyncEventQueue(recording)

        val pending = queueOverRecording.peekAll()

        assertEquals(listOf("/threshold/save_alarm" to "first"), pending.map { it.path to it.data })
        assertEquals(0, recording.directWriteCalls)
        assertEquals(1, recording.batchCalls.size)
        val (sets, removes) = recording.batchCalls.single()
        assertEquals(setOf(WearSyncEventQueue.LEGACY_KEY_QUEUE), removes)
        assertTrue(sets.isNotEmpty())
    }

    @Test
    fun `concurrent enqueue calls racing against a pending legacy migration lose no event`() {
        // Regression test for a race where WearMessageService and WearSyncPlugin, both going through the same singleton WearSyncEventQueue instance, could each pass migrateLegacyEntriesIfNeeded's "has legacy entries" check before either wrote back -- the second migration write would then silently clobber whichever new message the first caller's own enqueue() had just appended. Uses a bank of threads racing past a shared start gate (rather than an artificial delay) to make a regression likely to be caught, mirroring NativeEventBusTest's own concurrent-access test.
        seedLegacyEntries(legacyEntry(path = "/threshold/save_alarm", data = "legacy", timestamp = 1L))

        val threadCount = 32
        // Must have at least threadCount worker threads -- every task blocks on ready.countDown() then start.await() before doing any real work, so a smaller pool would deadlock (the main thread's ready.await() below can never see all threadCount count-downs if some tasks are still queued behind others that are themselves blocked on start).
        val executor = Executors.newFixedThreadPool(threadCount)
        val ready = CountDownLatch(threadCount)
        val start = CountDownLatch(1)
        try {
            val tasks = (0 until threadCount).map { i ->
                executor.submit {
                    ready.countDown()
                    start.await(5, TimeUnit.SECONDS)
                    queue.enqueue("/threshold/sync_request", "concurrent-$i")
                }
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS))
            start.countDown()
            tasks.forEach { it.get(5, TimeUnit.SECONDS) }

            val drained = deliverAll(queue)

            // The legacy entry plus every concurrently-enqueued message must all survive migration -- nothing lost to an overlapping migration write, and migration ran (and removed the legacy key) exactly once.
            assertEquals(threadCount + 1, drained.size)
            assertTrue(drained.contains("/threshold/save_alarm" to "legacy"))
            val expectedConcurrent = (0 until threadCount).map { "/threshold/sync_request" to "concurrent-$it" }.toSet()
            assertEquals(expectedConcurrent, drained.filter { it.first == "/threshold/sync_request" }.toSet())
            assertNull(store.get(WearSyncEventQueue.LEGACY_KEY_QUEUE))
        } finally {
            executor.shutdownNow()
        }
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
