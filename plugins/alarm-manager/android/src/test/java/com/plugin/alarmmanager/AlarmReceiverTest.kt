// Unit tests for AlarmReceiver's fired-event bookkeeping and NativeEventBus publish
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import ca.liminalhq.threshold.nativebus.NativeEventBus
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain JUnit 4 tests against [recordAndPublishFiredEvent] and [publishAlarmFiredToBus], the
 * seams factored out of [AlarmReceiver.handleAlarmBroadcast] so this is testable without a real
 * `BroadcastReceiver` dispatch/`goAsync()` (which need a live Android framework). Covers issue
 * #255 Phase 3A: the guard invariant that a non-live alarm (or an invalid id) never reaches
 * [NativeEventBus] or the durable persist, that the durable persist runs before the bus publish,
 * and the bus publish itself (right topic/payload shape, tag collection).
 */
class AlarmReceiverTest {

    @After
    fun tearDown() {
        // NativeEventBus is a process-wide singleton; without this, listeners registered by one
        // test would still be live (and firing) during the next one.
        NativeEventBus.resetForTests()
    }

    // --- recordAndPublishFiredEvent ---------------------------------------------------------

    @Test
    fun `a non-live alarm is never persisted or published to the bus`() {
        var persistCalled = false
        var busPublishReceived = false
        NativeEventBus.subscribe(TOPIC_FIRED) { busPublishReceived = true; null }

        val tags = recordAndPublishFiredEvent(alarmId = 42, isLive = false, actualFiredAt = 100L) {
            persistCalled = true
        }

        assertTrue(tags.isEmpty())
        assertFalse("a cancelled/deleted alarm must not be persisted", persistCalled)
        assertFalse("a cancelled/deleted alarm must not reach NativeEventBus", busPublishReceived)
    }

    @Test
    fun `a non-positive alarm id is never persisted or published even when isLive is true`() {
        var persistCalled = false
        var busPublishReceived = false
        NativeEventBus.subscribe(TOPIC_FIRED) { busPublishReceived = true; null }

        val tags = recordAndPublishFiredEvent(alarmId = 0, isLive = true, actualFiredAt = 100L) {
            persistCalled = true
        }

        assertTrue(tags.isEmpty())
        assertFalse(persistCalled)
        assertFalse(busPublishReceived)
    }

    @Test
    fun `a live alarm is persisted with the shared payload, then published to the bus`() {
        val persistedPayloads = mutableListOf<JSONObject>()
        NativeEventBus.subscribe(TOPIC_FIRED) { "watch-ring" }

        val tags = recordAndPublishFiredEvent(alarmId = 42, isLive = true, actualFiredAt = 1_755_100_800_000L) {
            persistedPayloads.add(it)
        }

        assertEquals(1, persistedPayloads.size)
        assertEquals(42, persistedPayloads.single().getInt("id"))
        assertEquals(1_755_100_800_000L, persistedPayloads.single().getLong("actualFiredAt"))
        assertEquals(setOf("watch-ring"), tags)
    }

    @Test
    fun `persist runs before the bus publish`() {
        val callOrder = mutableListOf<String>()
        NativeEventBus.subscribe(TOPIC_FIRED) { callOrder.add("bus-publish"); null }

        recordAndPublishFiredEvent(alarmId = 1, isLive = true, actualFiredAt = 100L) {
            callOrder.add("persist")
        }

        // Durable-persist-first: a process death between the two steps then still leaves Rust
        // with a record the alarm fired, rather than no record at all -- see the KDoc on
        // recordAndPublishFiredEvent.
        assertEquals(listOf("persist", "bus-publish"), callOrder)
    }

    // --- publishAlarmFiredToBus ---------------------------------------------------------------

    @Test
    fun `publishes on the alarm-manager native-fired topic with the given payload`() {
        var receivedTopic: String? = null
        var receivedPayload: String? = null
        NativeEventBus.subscribe(TOPIC_FIRED) { payload ->
            receivedTopic = TOPIC_FIRED
            receivedPayload = payload
            null
        }

        val firedPayload = JSONObject().apply {
            put("id", 42)
            put("actualFiredAt", 1_755_100_800_000L)
        }
        publishAlarmFiredToBus(firedPayload)

        assertEquals(TOPIC_FIRED, receivedTopic)
        val payload = JSONObject(requireNotNull(receivedPayload))
        assertEquals(42, payload.getInt("id"))
        assertEquals(1_755_100_800_000L, payload.getLong("actualFiredAt"))
    }

    @Test
    fun `returns the tags reported by listeners for this event`() {
        NativeEventBus.subscribe(TOPIC_FIRED) { "watch-ring" }

        val tags = publishAlarmFiredToBus(firedPayload(id = 1, actualFiredAt = 100L))

        assertEquals(setOf("watch-ring"), tags)
    }

    @Test
    fun `returns an empty set when no listener is registered`() {
        val tags = publishAlarmFiredToBus(firedPayload(id = 1, actualFiredAt = 100L))

        assertTrue(tags.isEmpty())
    }

    @Test
    fun `collects tags from multiple listeners into one set`() {
        NativeEventBus.subscribe(TOPIC_FIRED) { "watch-ring" }
        NativeEventBus.subscribe(TOPIC_FIRED) { "some-other-tag" }

        val tags = publishAlarmFiredToBus(firedPayload(id = 1, actualFiredAt = 100L))

        assertEquals(setOf("watch-ring", "some-other-tag"), tags)
    }

    private fun firedPayload(id: Int, actualFiredAt: Long): JSONObject =
        JSONObject().apply {
            put("id", id)
            put("actualFiredAt", actualFiredAt)
        }
}
