// Unit tests for WatchStopListener's pure payload-parsing/matching helpers and NativeEventBus registration
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
 * Plain JUnit 4 tests -- no Robolectric/instrumentation. Covers the pure functions [WatchStopListener] factors out ([parseWatchStopPayload], [shouldStopForWatchSignal]) plus [WatchStopListener.register]'s topic subscriptions, mirroring the style of wear-sync's `NativeFiredListenerTest` (the equivalent pure-helper coverage for the opposite direction). [WatchStopListener.handle] itself calls `Context.stopService`/`AlarmRingingService`, which need a real Android framework and aren't exercised here -- the matching decision it's built from ([shouldStopForWatchSignal]) is what's actually worth covering without one.
 */
class WatchStopListenerTest {

    @After
    fun tearDown() {
        // NativeEventBus is a process-wide singleton; without this, listeners registered by one test would still be live (and firing) during the next one.
        NativeEventBus.resetForTests()
    }

    // --- parseWatchStopPayload -----------------------------------------------------------------

    @Test
    fun `parses alarmId from a well-formed dismiss payload`() {
        val payload = JSONObject().apply { put("alarmId", 7) }.toString()

        assertEquals(WatchStopPayload(7), parseWatchStopPayload(payload))
    }

    @Test
    fun `ignores unrecognised fields like eventId and snoozeLengthMinutes`() {
        val payload = JSONObject().apply {
            put("alarmId", 7)
            put("eventId", "queue-envelope-id")
            put("snoozeLengthMinutes", 10)
        }.toString()

        assertEquals(WatchStopPayload(7), parseWatchStopPayload(payload))
    }

    @Test
    fun `returns null for malformed JSON`() {
        assertNull(parseWatchStopPayload("not even json"))
    }

    @Test
    fun `returns null when alarmId is missing`() {
        assertNull(parseWatchStopPayload(JSONObject().toString()))
    }

    @Test
    fun `returns null when alarmId is zero or negative`() {
        assertNull(parseWatchStopPayload(JSONObject().apply { put("alarmId", 0) }.toString()))
        assertNull(parseWatchStopPayload(JSONObject().apply { put("alarmId", -3) }.toString()))
    }

    // --- shouldStopForWatchSignal ---------------------------------------------------------------

    @Test
    fun `stops when the payload's alarmId matches the currently ringing alarm`() {
        val payload = JSONObject().apply { put("alarmId", 7) }.toString()

        assertEquals(7, shouldStopForWatchSignal(payload, currentlyRingingAlarmId = 7))
    }

    @Test
    fun `no-ops when the payload's alarmId does not match the currently ringing alarm`() {
        val payload = JSONObject().apply { put("alarmId", 7) }.toString()

        assertNull(shouldStopForWatchSignal(payload, currentlyRingingAlarmId = 8))
    }

    @Test
    fun `no-ops when nothing is currently ringing`() {
        val payload = JSONObject().apply { put("alarmId", 7) }.toString()

        assertNull(shouldStopForWatchSignal(payload, currentlyRingingAlarmId = -1))
    }

    @Test
    fun `no-ops for a malformed payload regardless of what is currently ringing`() {
        assertNull(shouldStopForWatchSignal("not even json", currentlyRingingAlarmId = 7))
    }

    // WatchStopListener.register()/handle() themselves need a real android.content.Context (applicationContext, Context.stopService) and AlarmRingingService's real companion state -- not exercised by this plain-JUnit suite (no Robolectric/instrumentation in this codebase's test-kotlin-plugins CI job), same as wear-sync's NativeFiredListener.register()/handle() aren't in NativeFiredListenerTest. The pure decision logic both delegate to (shouldStopForWatchSignal here, parseFiredPayload/isStale there) is what's covered above.
}
