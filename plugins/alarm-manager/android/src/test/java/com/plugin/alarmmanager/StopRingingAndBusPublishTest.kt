// Unit tests for stopRinging's id resolution and notifyAlarmDismissed/notifySnoozeRequested's NativeEventBus publish
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import ca.liminalhq.threshold.nativebus.NativeEventBus
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain JUnit 4 tests against [resolveStopRingingAlarmId] and [publishToBus], the seams factored out specifically to cover issue #255 Phase 4A: the in-app dismiss id-threading fix (every dismiss origin now produces a real id) and its consequence, publishing `alarm-manager:dismiss-requested`/`snooze-requested` uniformly onto [NativeEventBus] for every origin rather than only the notification action. Mirrors the style of `AlarmReceiverTest` (which covers the equivalent seams for the fired path).
 */
class StopRingingAndBusPublishTest {

    @After
    fun tearDown() {
        // NativeEventBus is a process-wide singleton; without this, listeners registered by one test would still be live (and firing) during the next one.
        NativeEventBus.resetForTests()
    }

    // --- resolveStopRingingAlarmId ------------------------------------------------------------

    @Test
    fun `resolves the explicit id when it is positive`() {
        assertEquals(42, resolveStopRingingAlarmId(42))
    }

    @Test
    fun `returns null when no explicit id is supplied`() {
        // The legacy ID-less JS notification-action fallback, and in-app snooze (which deliberately never threads an id through stopRinging -- see the KDoc on resolveStopRingingAlarmId for why).
        assertNull(resolveStopRingingAlarmId(null))
    }

    @Test
    fun `returns null for a zero or negative explicit id`() {
        assertNull(resolveStopRingingAlarmId(0))
        assertNull(resolveStopRingingAlarmId(-1))
    }

    // --- publishToBus (dismiss) --------------------------------------------------------------

    @Test
    fun `publishes on the dismiss topic with the given payload`() {
        var receivedPayload: String? = null
        NativeEventBus.subscribe(TOPIC_DISMISS) { payload -> receivedPayload = payload; null }

        publishToBus(TOPIC_DISMISS, JSONObject().put("id", 7))

        val payload = JSONObject(requireNotNull(receivedPayload))
        assertEquals(7, payload.getInt("id"))
    }

    @Test
    fun `returns the tags reported by listeners for the dismiss topic`() {
        NativeEventBus.subscribe(TOPIC_DISMISS) { "watch-stop" }

        val tags = publishToBus(TOPIC_DISMISS, JSONObject().put("id", 7))

        assertEquals(setOf("watch-stop"), tags)
    }

    @Test
    fun `returns an empty set when no listener is registered for dismiss`() {
        val tags = publishToBus(TOPIC_DISMISS, JSONObject().put("id", 7))

        assertTrue(tags.isEmpty())
    }

    // --- publishToBus (snooze) ----------------------------------------------------------------

    @Test
    fun `publishes on the snooze topic with the given payload`() {
        var receivedPayload: String? = null
        NativeEventBus.subscribe(TOPIC_SNOOZE) { payload -> receivedPayload = payload; null }

        publishToBus(TOPIC_SNOOZE, JSONObject().put("id", 9))

        val payload = JSONObject(requireNotNull(receivedPayload))
        assertEquals(9, payload.getInt("id"))
    }

    @Test
    fun `dismiss and snooze topics are independent -- a dismiss listener does not see a snooze publish`() {
        var dismissReceived = false
        NativeEventBus.subscribe(TOPIC_DISMISS) { dismissReceived = true; null }

        publishToBus(TOPIC_SNOOZE, JSONObject().put("id", 1))

        assertTrue("a listener on TOPIC_DISMISS must not receive a TOPIC_SNOOZE publish", !dismissReceived)
    }
}
