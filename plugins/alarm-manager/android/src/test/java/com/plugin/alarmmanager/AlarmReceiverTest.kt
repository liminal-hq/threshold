// Unit tests for AlarmReceiver's NativeEventBus publish and tag collection
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import ca.liminalhq.threshold.nativebus.NativeEventBus
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain JUnit 4 tests against [publishAlarmFiredToBus], the seam factored out of
 * [AlarmReceiver.onReceive] so this is testable without a real `BroadcastReceiver`
 * dispatch/`goAsync()` (which need a live Android framework). Covers issue #255 Phase 3A: the
 * bus publish happens with the right topic/payload shape, and the tags any listeners report
 * (e.g. wear-sync's cold-process ring handler returning `"watch-ring"`) are returned so
 * [AlarmReceiver] can thread them into [AlarmManagerPlugin.notifyAlarmFired]. The far side of
 * that threading (tags -> enriched Channel/queue payload) is covered separately by
 * [AlarmManagerPluginTest]'s `enrichPayloadForDispatch` tests.
 */
class AlarmReceiverTest {

    @After
    fun tearDown() {
        // NativeEventBus is a process-wide singleton; without this, listeners registered by one
        // test would still be live (and firing) during the next one.
        NativeEventBus.resetForTests()
    }

    @Test
    fun `publishes on the alarm-manager native-fired topic with id and actualFiredAt`() {
        var receivedTopic: String? = null
        var receivedPayload: String? = null
        NativeEventBus.subscribe(TOPIC_FIRED) { payload ->
            receivedTopic = TOPIC_FIRED
            receivedPayload = payload
            null
        }

        publishAlarmFiredToBus(alarmId = 42, actualFiredAt = 1_755_100_800_000L)

        assertEquals(TOPIC_FIRED, receivedTopic)
        val payload = JSONObject(requireNotNull(receivedPayload))
        assertEquals(42, payload.getInt("id"))
        assertEquals(1_755_100_800_000L, payload.getLong("actualFiredAt"))
    }

    @Test
    fun `returns the tags reported by listeners for this event`() {
        NativeEventBus.subscribe(TOPIC_FIRED) { "watch-ring" }

        val tags = publishAlarmFiredToBus(alarmId = 1, actualFiredAt = 100L)

        assertEquals(setOf("watch-ring"), tags)
    }

    @Test
    fun `returns an empty set when no listener is registered`() {
        val tags = publishAlarmFiredToBus(alarmId = 1, actualFiredAt = 100L)

        assertTrue(tags.isEmpty())
    }

    @Test
    fun `collects tags from multiple listeners into one set`() {
        NativeEventBus.subscribe(TOPIC_FIRED) { "watch-ring" }
        NativeEventBus.subscribe(TOPIC_FIRED) { "some-other-tag" }

        val tags = publishAlarmFiredToBus(alarmId = 1, actualFiredAt = 100L)

        assertEquals(setOf("watch-ring", "some-other-tag"), tags)
    }
}
