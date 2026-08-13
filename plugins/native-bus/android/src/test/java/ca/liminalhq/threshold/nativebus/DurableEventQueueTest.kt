// Unit tests for DurableEventQueue
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.nativebus

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Plain JUnit 4 tests against an in-memory [KeyValueStore] fake -- no Robolectric needed. */
class DurableEventQueueTest {

    private lateinit var store: InMemoryKeyValueStore
    private lateinit var queue: DurableEventQueue

    @Before
    fun setUp() {
        store = InMemoryKeyValueStore()
        queue = DurableEventQueue(store, PREFS_KEY)
    }

    @Test
    fun `entries drain in chronological order regardless of topic`() {
        // enqueue() stamps publishedAt from the wall clock, so to pin ordering
        // deterministically the raw envelopes are written directly into the store.
        writeRawEnvelopes(
            envelope(topic = "b", payload = "second", eventId = "id-2", publishedAt = 200),
            envelope(topic = "a", payload = "first", eventId = "id-1", publishedAt = 100),
            envelope(topic = "a", payload = "third", eventId = "id-3", publishedAt = 300),
        )

        val drained = queue.drainAll(pipelineReady = true)

        assertEquals(listOf("id-1", "id-2", "id-3"), drained.map { it.eventId })
    }

    @Test
    fun `handledNatively tags round-trip through enqueue, persist and drain`() {
        queue.enqueue("topic", "payload", handledNatively = setOf("vibrated", "notified"))

        val drained = queue.drainAll(pipelineReady = true)

        assertEquals(setOf("vibrated", "notified"), drained.single().handledNatively)
    }

    @Test
    fun `nothing drains while the pipeline is not ready`() {
        queue.enqueue("topic", "payload")

        val drainedWhileNotReady = queue.drainAll(pipelineReady = false)

        assertTrue(drainedWhileNotReady.isEmpty())
        // The entry must still be there once the pipeline does become ready.
        assertEquals(1, queue.drainAll(pipelineReady = true).size)
    }

    @Test
    fun `corrupt individual entries are skipped without failing the whole drain`() {
        val array = JSONArray()
        array.put(envelope(topic = "a", payload = "good-1", eventId = "id-1", publishedAt = 100))
        array.put("not even a JSON object")
        array.put(JSONObject().apply { put("v", 1) }) // missing required fields
        array.put(envelope(topic = "a", payload = "good-2", eventId = "id-2", publishedAt = 200))
        store.set(PREFS_KEY, array.toString())

        val drained = queue.drainAll(pipelineReady = true)

        assertEquals(listOf("id-1", "id-2"), drained.map { it.eventId })
    }

    @Test
    fun `an entirely corrupt persisted log is tolerated as empty rather than crashing`() {
        store.set(PREFS_KEY, "{not json at all")

        val drained = queue.drainAll(pipelineReady = true)

        assertTrue(drained.isEmpty())
    }

    @Test
    fun `an unrecognised schema version is skipped rather than crashing the drain`() {
        val array = JSONArray()
        array.put(envelope(topic = "a", payload = "good", eventId = "id-1", publishedAt = 100))
        array.put(envelope(topic = "a", payload = "future", eventId = "id-future", publishedAt = 150, version = 99))
        store.set(PREFS_KEY, array.toString())

        val drained = queue.drainAll(pipelineReady = true)

        assertEquals(listOf("id-1"), drained.map { it.eventId })
    }

    @Test
    fun `enqueue and drain work correctly across multiple topics mixed in one log`() {
        queue.enqueue("topic-a", "payload-1")
        queue.enqueue("topic-b", "payload-2")
        queue.enqueue("topic-a", "payload-3")

        val drained = queue.drainAll(pipelineReady = true)

        assertEquals(listOf("topic-a", "topic-b", "topic-a"), drained.map { it.topic })
        assertEquals(listOf("payload-1", "payload-2", "payload-3"), drained.map { it.payload })
    }

    @Test
    fun `commit removes only the given event ids, leaving the rest for retry`() {
        val id1 = queue.enqueue("topic", "one")
        val id2 = queue.enqueue("topic", "two")

        queue.commit(setOf(id1))

        val remaining = queue.drainAll(pipelineReady = true)
        assertEquals(listOf(id2), remaining.map { it.eventId })
    }

    @Test
    fun `clear drops every persisted entry unconditionally`() {
        queue.enqueue("topic", "one")
        queue.enqueue("topic", "two")

        queue.clear()

        assertTrue(queue.drainAll(pipelineReady = true).isEmpty())
    }

    private fun envelope(
        topic: String,
        payload: String,
        eventId: String,
        publishedAt: Long,
        version: Int = 1,
    ): JSONObject =
        JSONObject().apply {
            put("v", version)
            put("topic", topic)
            put("payload", payload)
            put("eventId", eventId)
            put("publishedAt", publishedAt)
            put("handledNatively", JSONArray())
        }

    private fun writeRawEnvelopes(vararg envelopes: JSONObject) {
        val array = JSONArray()
        envelopes.forEach { array.put(it) }
        store.set(PREFS_KEY, array.toString())
    }

    companion object {
        private const val PREFS_KEY = "test-queue"
    }
}
