// Unit tests for AlarmManagerPlugin's migration and topic-dispatch logic
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import ca.liminalhq.threshold.nativebus.DurableEventQueue
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Plain JUnit 4 tests against [InMemoryKeyValueStore], covering the two pieces of logic this
 * plugin's migration to a shared [DurableEventQueue] added: [migrateLegacyQueues] (folding the
 * four legacy per-type queues into the unified log) and [drainAndDispatch] (draining that log
 * in arrival order and routing each entry to the right handler by topic). [DurableEventQueue]'s
 * own drain/commit/corruption-tolerance behaviour is already covered by
 * `plugins/native-bus`'s own test suite and isn't re-tested here.
 */
class AlarmManagerPluginTest {

    private lateinit var store: InMemoryKeyValueStore

    @Before
    fun setUp() {
        store = InMemoryKeyValueStore()
    }

    // --- migrateLegacyQueues ---------------------------------------------------------------

    @Test
    fun `migrates one entry of each legacy type into the unified log with the correct topic and payload`() {
        store.set(LEGACY_KEY_PENDING_ALARM_EVENTS, JSONArray().put(legacyFired(id = 1, actualFiredAt = 5_000)).toString())
        store.set(LEGACY_KEY_PENDING_SNOOZE_EVENTS, JSONArray().put(legacyIdOnly(id = 2)).toString())
        store.set(LEGACY_KEY_PENDING_DISMISS_EVENTS, JSONArray().put(legacyIdOnly(id = 3)).toString())
        store.set(
            LEGACY_KEY_PENDING_IMPORT_EVENTS,
            JSONArray().put(legacyImport(id = 4, hour = 7, minute = 30, label = "Wake up", activeDays = listOf(1, 3, 5), triggerAt = 9_000))
                .toString(),
        )

        val migratedCount = migrateLegacyQueues(store)
        assertEquals(4, migratedCount)

        val drained = DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true)
        val byTopic = drained.associateBy { it.topic }

        assertEquals(setOf(TOPIC_FIRED, TOPIC_SNOOZE, TOPIC_DISMISS, TOPIC_IMPORT), byTopic.keys)

        val firedPayload = JSONObject(byTopic.getValue(TOPIC_FIRED).payload)
        assertEquals(1, firedPayload.getInt("id"))
        assertEquals(5_000L, firedPayload.getLong("actualFiredAt"))

        assertEquals(2, JSONObject(byTopic.getValue(TOPIC_SNOOZE).payload).getInt("id"))
        assertEquals(3, JSONObject(byTopic.getValue(TOPIC_DISMISS).payload).getInt("id"))

        val importPayload = JSONObject(byTopic.getValue(TOPIC_IMPORT).payload)
        assertEquals(4, importPayload.getInt("id"))
        assertEquals(7, importPayload.getInt("hour"))
        assertEquals(30, importPayload.getInt("minute"))
        assertEquals("Wake up", importPayload.getString("label"))
        assertEquals(9_000L, importPayload.getLong("triggerAt"))
    }

    @Test
    fun `removes every legacy key once migration completes`() {
        store.set(LEGACY_KEY_PENDING_ALARM_EVENTS, JSONArray().put(legacyFired(id = 1, actualFiredAt = 1_000)).toString())
        store.set(LEGACY_KEY_PENDING_SNOOZE_EVENTS, JSONArray().put(legacyIdOnly(id = 2)).toString())

        migrateLegacyQueues(store)

        assertNull(store.get(LEGACY_KEY_PENDING_ALARM_EVENTS))
        assertNull(store.get(LEGACY_KEY_PENDING_SNOOZE_EVENTS))
        assertNull(store.get(LEGACY_KEY_PENDING_DISMISS_EVENTS))
        assertNull(store.get(LEGACY_KEY_PENDING_IMPORT_EVENTS))
    }

    @Test
    fun `uses actualFiredAt as the migrated publishedAt for fired events`() {
        // Seeded out of chronological order -- the later actualFiredAt is appended first.
        store.set(
            LEGACY_KEY_PENDING_ALARM_EVENTS,
            JSONArray()
                .put(legacyFired(id = 1, actualFiredAt = 200))
                .put(legacyFired(id = 2, actualFiredAt = 100))
                .toString(),
        )

        migrateLegacyQueues(store)

        val drained = DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true)
        // drainAll sorts by publishedAt, so id=2 (actualFiredAt=100) must come first even
        // though it was appended second in the legacy array.
        assertEquals(listOf(2, 1), drained.map { JSONObject(it.payload).getInt("id") })
    }

    @Test
    fun `falls back to original array order for legacy entries with no recorded timestamp`() {
        store.set(
            LEGACY_KEY_PENDING_SNOOZE_EVENTS,
            JSONArray()
                .put(legacyIdOnly(id = 10))
                .put(legacyIdOnly(id = 20))
                .put(legacyIdOnly(id = 30))
                .toString(),
        )

        migrateLegacyQueues(store)

        val drained = DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true)
        assertEquals(listOf(10, 20, 30), drained.map { JSONObject(it.payload).getInt("id") })
    }

    @Test
    fun `migration is a one-time no-op once the legacy keys are already gone`() {
        store.set(LEGACY_KEY_PENDING_SNOOZE_EVENTS, JSONArray().put(legacyIdOnly(id = 1)).toString())
        assertEquals(1, migrateLegacyQueues(store))

        // A second run (e.g. a later app launch) must not re-migrate or duplicate anything.
        assertEquals(0, migrateLegacyQueues(store))
        assertEquals(1, DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true).size)
    }

    @Test
    fun `preserves entries already sitting in the unified log before migration runs`() {
        val preExistingId = DurableEventQueue(store, EVENT_LOG_KEY).enqueue(TOPIC_FIRED, JSONObject().put("id", 99).toString())
        store.set(LEGACY_KEY_PENDING_SNOOZE_EVENTS, JSONArray().put(legacyIdOnly(id = 1)).toString())

        migrateLegacyQueues(store)

        val drained = DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true)
        assertEquals(2, drained.size)
        assertTrue(drained.any { it.eventId == preExistingId })
    }

    @Test
    fun `entries with a missing or non-positive id are skipped`() {
        store.set(
            LEGACY_KEY_PENDING_SNOOZE_EVENTS,
            JSONArray()
                .put(legacyIdOnly(id = 0))
                .put(JSONObject())
                .put(legacyIdOnly(id = 5))
                .toString(),
        )

        val migratedCount = migrateLegacyQueues(store)

        assertEquals(1, migratedCount)
        val drained = DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true)
        assertEquals(listOf(5), drained.map { JSONObject(it.payload).getInt("id") })
    }

    @Test
    fun `a corrupt legacy array is skipped without failing migration of the others`() {
        store.set(LEGACY_KEY_PENDING_ALARM_EVENTS, "not even json")
        store.set(LEGACY_KEY_PENDING_SNOOZE_EVENTS, JSONArray().put(legacyIdOnly(id = 7)).toString())

        val migratedCount = migrateLegacyQueues(store)

        assertEquals(1, migratedCount)
        val drained = DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true)
        assertEquals(listOf(7), drained.map { JSONObject(it.payload).getInt("id") })
    }

    @Test
    fun `does nothing when no legacy keys are present`() {
        assertEquals(0, migrateLegacyQueues(store))
        assertTrue(DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true).isEmpty())
    }

    // --- drainAndDispatch --------------------------------------------------------------------

    @Test
    fun `drains events across topics in publishedAt order and dispatches each to the right handler`() {
        val queue = DurableEventQueue(store, EVENT_LOG_KEY)
        writeRawEnvelopes(
            envelope(topic = TOPIC_IMPORT, payload = "import-payload", eventId = "id-3", publishedAt = 300),
            envelope(topic = TOPIC_FIRED, payload = "fired-payload", eventId = "id-1", publishedAt = 100),
            envelope(topic = TOPIC_SNOOZE, payload = "snooze-payload", eventId = "id-2", publishedAt = 200),
        )

        val dispatched = mutableListOf<Pair<String, String>>()
        val handledCount = drainAndDispatch(queue) { topic, payload ->
            dispatched.add(topic to payload)
            true
        }

        assertEquals(3, handledCount)
        assertEquals(
            listOf(
                TOPIC_FIRED to "fired-payload",
                TOPIC_SNOOZE to "snooze-payload",
                TOPIC_IMPORT to "import-payload",
            ),
            dispatched,
        )
    }

    @Test
    fun `entries the dispatcher declines stay queued for a later retry`() {
        val queue = DurableEventQueue(store, EVENT_LOG_KEY)
        val deliveredId = queue.enqueue(TOPIC_FIRED, "delivered")
        val undeliveredId = queue.enqueue(TOPIC_SNOOZE, "undelivered")

        val handledCount = drainAndDispatch(queue) { topic, _ -> topic == TOPIC_FIRED }

        assertEquals(1, handledCount)
        val remaining = queue.drainAll(pipelineReady = true)
        assertEquals(listOf(undeliveredId), remaining.map { it.eventId })
        assertTrue(remaining.none { it.eventId == deliveredId })
    }

    @Test
    fun `draining an empty queue dispatches nothing and returns zero`() {
        val queue = DurableEventQueue(store, EVENT_LOG_KEY)
        var dispatchCalls = 0

        val handledCount = drainAndDispatch(queue) { _, _ -> dispatchCalls++; true }

        assertEquals(0, handledCount)
        assertEquals(0, dispatchCalls)
    }

    // --- fixtures ------------------------------------------------------------------------------

    private fun legacyFired(id: Int, actualFiredAt: Long): JSONObject =
        JSONObject().apply {
            put("id", id)
            put("actualFiredAt", actualFiredAt)
        }

    private fun legacyIdOnly(id: Int): JSONObject = JSONObject().apply { put("id", id) }

    private fun legacyImport(id: Int, hour: Int, minute: Int, label: String, activeDays: List<Int>, triggerAt: Long): JSONObject =
        JSONObject().apply {
            put("id", id)
            put("hour", hour)
            put("minute", minute)
            put("label", label)
            put("activeDays", JSONArray(activeDays))
            put("triggerAt", triggerAt)
        }

    // Mirrors DurableEventQueueTest's own writeRawEnvelopes/envelope helpers -- writing the raw
    // schema directly is the only way to pin publishedAt deterministically, since
    // DurableEventQueue.enqueue() always stamps it from the wall clock.
    private fun envelope(topic: String, payload: String, eventId: String, publishedAt: Long): JSONObject =
        JSONObject().apply {
            put("v", DurableEventQueue.SCHEMA_VERSION)
            put("topic", topic)
            put("payload", payload)
            put("eventId", eventId)
            put("publishedAt", publishedAt)
            put("handledNatively", JSONArray())
        }

    private fun writeRawEnvelopes(vararg envelopes: JSONObject) {
        val array = JSONArray()
        envelopes.forEach { array.put(it) }
        store.set(EVENT_LOG_KEY, array.toString())
    }
}
