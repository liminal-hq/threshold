// Unit tests for AlarmManagerPlugin's migration and topic-dispatch logic
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import ca.liminalhq.threshold.nativebus.DurableEventQueue
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/**
 * Plain JUnit 4 tests against [InMemoryKeyValueStore], covering the two pieces of logic this plugin's migration to a shared [DurableEventQueue] added: [migrateLegacyQueues] (folding the four legacy per-type queues into the unified log) and [drainAndDispatch] (draining that log in arrival order and routing each entry to the right handler by topic). [DurableEventQueue]'s own drain/commit/corruption-tolerance behaviour is already covered by `plugins/native-bus`'s own test suite and isn't re-tested here.
 *
 * Also covers [sharedEventQueueFor] -- the process-wide singleton holder [eventQueue] delegates to, added to fix a PR #298 review finding: `eventQueue(context)` used to construct a brand new [DurableEventQueue] on every call, so two callers (e.g. `AlarmReceiver`'s background executor enqueuing a fired event, and `markAlarmPipelineReady`'s main-thread drain) got their own, entirely independent instances pointed at the same underlying storage -- [DurableEventQueue]'s own `@Synchronized` methods only lock their own instance's monitor, so that provided no mutual exclusion between them at all.
 */
class AlarmManagerPluginTest {

    private lateinit var store: InMemoryKeyValueStore

    @Before
    fun setUp() {
        store = InMemoryKeyValueStore()
        // sharedEventQueueFor caches its DurableEventQueue in a process-wide (top-level) var --
        // without resetting it, whichever test runs first would permanently pin every later
        // test's sharedEventQueueFor(store) call to *that* test's now-stale store instance.
        resetSharedEventQueueForTests()
    }

    @After
    fun tearDown() {
        resetSharedEventQueueForTests()
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
        // drainAll sorts by publishedAt, so id=2 (actualFiredAt=100) must come first even though it was appended second in the legacy array.
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

    @Test
    fun `treats legacy keys already drained back to an empty array as nothing to migrate`() {
        // The pre-migration drain code always rewrote a queue back to "[]" after draining it rather than removing the key -- so on any real device that's ever used alarms, these keys exist but hold no real data. A plain non-null guard would never fast-path here.
        store.set(LEGACY_KEY_PENDING_ALARM_EVENTS, "[]")
        store.set(LEGACY_KEY_PENDING_SNOOZE_EVENTS, "[]")
        store.set(LEGACY_KEY_PENDING_DISMISS_EVENTS, "[]")
        store.set(LEGACY_KEY_PENDING_IMPORT_EVENTS, " [ ] ")

        assertEquals(0, migrateLegacyQueues(store))
        assertTrue(DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true).isEmpty())
    }

    @Test
    fun `still migrates real entries when other legacy keys hold only an empty array`() {
        store.set(LEGACY_KEY_PENDING_ALARM_EVENTS, "[]")
        store.set(LEGACY_KEY_PENDING_SNOOZE_EVENTS, JSONArray().put(legacyIdOnly(id = 1)).toString())

        val migratedCount = migrateLegacyQueues(store)

        assertEquals(1, migratedCount)
        val drained = DurableEventQueue(store, EVENT_LOG_KEY).drainAll(pipelineReady = true)
        assertEquals(listOf(1), drained.map { JSONObject(it.payload).getInt("id") })
    }

    @Test
    fun `migration applies the new log write and every legacy key removal as a single atomic batch`() {
        val recording = RecordingKeyValueStore()
        recording.seed(LEGACY_KEY_PENDING_SNOOZE_EVENTS, JSONArray().put(legacyIdOnly(id = 1)).toString())
        recording.seed(LEGACY_KEY_PENDING_DISMISS_EVENTS, JSONArray().put(legacyIdOnly(id = 2)).toString())

        val migratedCount = migrateLegacyQueues(recording)

        assertEquals(2, migratedCount)
        // No direct set()/remove() calls -- everything must go through the one atomic batch(), so a process kill can never observe the new log written but a legacy key still present.
        assertEquals(0, recording.directWriteCalls)
        assertEquals(1, recording.batchCalls.size)

        val (sets, removes) = recording.batchCalls.single()
        assertEquals(setOf(EVENT_LOG_KEY), sets.keys)
        assertEquals(
            setOf(
                LEGACY_KEY_PENDING_ALARM_EVENTS,
                LEGACY_KEY_PENDING_SNOOZE_EVENTS,
                LEGACY_KEY_PENDING_DISMISS_EVENTS,
                LEGACY_KEY_PENDING_IMPORT_EVENTS,
            ),
            removes,
        )
    }

    @Test
    fun `legacy keys holding only invalid entries are still removed via a single batch with nothing to write`() {
        val recording = RecordingKeyValueStore()
        recording.seed(LEGACY_KEY_PENDING_SNOOZE_EVENTS, JSONArray().put(legacyIdOnly(id = 0)).toString())

        val migratedCount = migrateLegacyQueues(recording)

        assertEquals(0, migratedCount)
        assertEquals(0, recording.directWriteCalls)
        assertEquals(1, recording.batchCalls.size)
        val (sets, removes) = recording.batchCalls.single()
        assertTrue(sets.isEmpty())
        assertEquals(4, removes.size)
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

    @Test
    fun `commits each envelope immediately after its own successful dispatch, not batched at the end`() {
        // Per Phase 3C's review: Rust's in-memory EventDedup buffer is wiped by the same crash
        // that would cause a redelivery, so it can't protect against a process kill between a
        // successful Channel delivery and this queue's commit. Committing per-item (rather than
        // accumulating every commit until the whole drain loop finishes) shrinks that window
        // from "the rest of the batch" down to "at most the one entry in flight" -- simulated
        // here by having the second dispatch throw ("crash") and checking that the first
        // entry's commit had already landed before that happened.
        val queue = DurableEventQueue(store, EVENT_LOG_KEY)
        val firstId = queue.enqueue(TOPIC_FIRED, JSONObject().put("id", 1).toString())
        val secondId = queue.enqueue(TOPIC_SNOOZE, JSONObject().put("id", 2).toString())

        var dispatchCalls = 0
        try {
            drainAndDispatch(queue) { _, _ ->
                dispatchCalls++
                if (dispatchCalls == 1) true else throw RuntimeException("simulated crash mid-drain")
            }
            fail("expected the simulated crash to propagate out of drainAndDispatch")
        } catch (e: RuntimeException) {
            assertEquals("simulated crash mid-drain", e.message)
        }

        // The first envelope's commit already ran before the "crash" on the second, so only the
        // second -- still in flight at the moment of the crash -- remains queued for retry.
        val remaining = queue.drainAll(pipelineReady = true)
        assertEquals(listOf(secondId), remaining.map { it.eventId })
        assertTrue(remaining.none { it.eventId == firstId })
    }

    // --- sharedEventQueueFor (PR #298 review: background-worker/main-thread queue race) ------

    @Test
    fun `sharedEventQueueFor returns the same instance on repeated calls against the same store`() {
        val first = sharedEventQueueFor(store)
        val second = sharedEventQueueFor(store)

        assertSame(first, second)
    }

    @Test
    fun `concurrent callers of sharedEventQueueFor all resolve to one instance, even racing its first construction`() {
        val threadCount = 16
        val ready = java.util.concurrent.CyclicBarrier(threadCount)
        val results = java.util.Collections.synchronizedList(mutableListOf<DurableEventQueue>())
        val threads = (0 until threadCount).map {
            Thread {
                ready.await()
                results.add(sharedEventQueueFor(store))
            }
        }

        threads.forEach { it.start() }
        threads.forEach { it.join(5_000) }

        assertEquals(threadCount, results.size)
        assertTrue(
            "every caller must resolve to the exact same DurableEventQueue instance",
            results.all { it === results[0] },
        )
    }

    @Test
    fun `a background-executor enqueue racing a main-thread drain-commit loop never loses or resurrects an event`() {
        // Regression test for the exact race PR #298's review flagged: AlarmReceiver's
        // background-executor worker enqueuing fired events (the "writer" thread below)
        // concurrently with markAlarmPipelineReady's main-thread drain (the "reader" thread).
        // Before the fix, eventQueue(context) constructed a brand new DurableEventQueue on
        // every single call, so these two call sites held entirely independent instances with
        // no shared lock between them -- DurableEventQueue's own @Synchronized methods only
        // lock their own instance's monitor. A drain's stale read-then-write could resurrect an
        // entry the writer had already committed as delivered, or an enqueue could clobber a
        // concurrent commit outright. Both threads below call sharedEventQueueFor(store)
        // themselves (not a pre-fetched reference), mirroring exactly how eventQueue(context)
        // is invoked fresh at each real call site -- so this would catch a regression back to
        // "one DurableEventQueue per call" just as readily as it catches a broken lock.
        val eventCount = 500
        val delivered = java.util.Collections.synchronizedList(mutableListOf<Int>())
        val writerDone = java.util.concurrent.atomic.AtomicBoolean(false)

        val writer = Thread {
            for (i in 0 until eventCount) {
                sharedEventQueueFor(store).enqueue(TOPIC_FIRED, JSONObject().put("id", i).toString())
            }
            writerDone.set(true)
        }
        val reader = Thread {
            while (!writerDone.get() || delivered.size < eventCount) {
                val queue = sharedEventQueueFor(store)
                val drained = queue.drainAll(pipelineReady = true)
                for (envelope in drained) {
                    delivered.add(JSONObject(envelope.payload).getInt("id"))
                    queue.commit(setOf(envelope.eventId))
                }
            }
        }.apply { isDaemon = true }

        reader.start()
        writer.start()
        writer.join(15_000)
        reader.join(15_000)

        assertEquals("no event should be lost", eventCount, delivered.size)
        assertEquals(
            "no event should be delivered/committed twice (a resurrected envelope)",
            eventCount,
            delivered.distinct().size,
        )
        assertTrue(sharedEventQueueFor(store).drainAll(pipelineReady = true).isEmpty())
    }

    // --- enrichPayloadForDispatch (issue #255 Phase 3A) -----------------------------------------
    // handledNatively is written directly into the payload upfront by notifyAlarmFired (not
    // late-injected here any more -- see enrichPayloadForDispatch's KDoc), so these tests build
    // the envelope's payload the same way notifyAlarmFired does: with handledNatively already
    // baked in. enrichPayloadForDispatch's only remaining job is stamping the envelope's own
    // eventId on top, without disturbing whatever handledNatively is already sitting there.

    @Test
    fun `enriches a fired-event payload with the envelope's own eventId, leaving its pre-baked handledNatively untouched`() {
        val queue = DurableEventQueue(store, EVENT_LOG_KEY)
        val basePayload = JSONObject().apply {
            put("id", 7)
            put("actualFiredAt", 1_755_100_800_000L)
            put("handledNatively", JSONArray(listOf("watch-ring")))
        }
        val eventId = queue.enqueue(TOPIC_FIRED, basePayload.toString())

        val dispatchedPayloads = mutableListOf<String>()
        drainAndDispatch(queue) { _, payload -> dispatchedPayloads.add(payload); true }

        val enriched = JSONObject(dispatchedPayloads.single())
        assertEquals(7, enriched.getInt("id"))
        assertEquals(1_755_100_800_000L, enriched.getLong("actualFiredAt"))
        assertEquals(eventId, enriched.getString("eventId"))
        val handledNatively = enriched.getJSONArray("handledNatively")
        assertEquals(1, handledNatively.length())
        assertEquals("watch-ring", handledNatively.getString(0))
    }

    @Test
    fun `a fired event whose payload already has an empty handledNatively array dispatches with it unchanged`() {
        val queue = DurableEventQueue(store, EVENT_LOG_KEY)
        val basePayload = JSONObject().apply {
            put("id", 1)
            put("handledNatively", JSONArray())
        }
        queue.enqueue(TOPIC_FIRED, basePayload.toString())

        val dispatchedPayloads = mutableListOf<String>()
        drainAndDispatch(queue) { _, payload -> dispatchedPayloads.add(payload); true }

        val enriched = JSONObject(dispatchedPayloads.single())
        assertEquals(0, enriched.getJSONArray("handledNatively").length())
    }

    @Test
    fun `non-fired topics are dispatched with their payload unchanged`() {
        val queue = DurableEventQueue(store, EVENT_LOG_KEY)
        val snoozePayload = JSONObject().put("id", 3).toString()
        queue.enqueue(TOPIC_SNOOZE, snoozePayload)

        val dispatchedPayloads = mutableListOf<String>()
        drainAndDispatch(queue) { _, payload -> dispatchedPayloads.add(payload); true }

        assertEquals(snoozePayload, dispatchedPayloads.single())
    }

    @Test
    fun `enrichPayloadForDispatch falls back to the unmodified payload if it isn't valid JSON`() {
        val malformed = DurableEventQueue.Envelope(
            topic = TOPIC_FIRED,
            payload = "not json",
            eventId = "some-id",
            publishedAt = 0L,
            handledNatively = emptySet(),
        )

        assertEquals("not json", enrichPayloadForDispatch(malformed))
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

    // Mirrors DurableEventQueueTest's own writeRawEnvelopes/envelope helpers -- writing the raw schema directly is the only way to pin publishedAt deterministically, since DurableEventQueue.enqueue() always stamps it from the wall clock.
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
