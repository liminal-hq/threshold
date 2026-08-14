// Unit tests for NativeStopListener's pure payload-parsing/construction helpers
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Plain JUnit 4 tests -- no Robolectric/instrumentation. Covers the pure functions
 * [NativeStopListener] (and the shared [buildAlarmDismissPayload]/[buildAlarmSnoozePayload]
 * helpers it calls) factor out specifically so this parsing/payload-construction logic is
 * testable independent of [android.content.Context], [ca.liminalhq.threshold.nativebus.NativeEventBus],
 * and Play Services -- mirrors the style of [NativeFiredListenerTest].
 *
 * [NativeStopListener.handleDismiss]/[handleSnooze] themselves aren't exercised here, same as
 * [NativeFiredListener.handle] isn't in [NativeFiredListenerTest]: both need a real
 * [android.content.Context] to construct a call, and the actual watch send goes through
 * [sendWatchMessageToConnectedNodes], which needs live Play Services clients neither this test
 * source set nor its dependencies (plain JUnit + `org.json`, no mocking framework) can fake.
 * What *is* verified here -- by inspection of NativeStopListener.kt, not by a runtime
 * assertion -- is that [NativeStopListener.handleDismiss]/[handleSnooze] call
 * [sendWatchMessageToConnectedNodes] (the same shared send-loop [NativeFiredListener] and
 * [WearSyncPlugin.sendAlarmRing] use) rather than iterating `connectedNodes` themselves.
 */
class NativeStopListenerTest {

    // ── parseIdPayload ───────────────────────────────────────────────

    @Test
    fun `parseIdPayload reads a positive id from a well-formed payload`() {
        val payload = JSONObject().apply { put("id", 42) }.toString()

        assertEquals(42, parseIdPayload(payload))
    }

    @Test
    fun `parseIdPayload returns null for malformed JSON`() {
        assertNull(parseIdPayload("not even json"))
    }

    @Test
    fun `parseIdPayload returns null when id is missing`() {
        assertNull(parseIdPayload(JSONObject().toString()))
    }

    @Test
    fun `parseIdPayload returns null when id is zero`() {
        val payload = JSONObject().apply { put("id", 0) }.toString()

        assertNull(parseIdPayload(payload))
    }

    @Test
    fun `parseIdPayload returns null when id is negative`() {
        val payload = JSONObject().apply { put("id", -5) }.toString()

        assertNull(parseIdPayload(payload))
    }

    // ── buildAlarmDismissPayload (shared with WearSyncPlugin.sendAlarmDismiss) ──────────

    @Test
    fun `buildAlarmDismissPayload encodes just the alarm id`() {
        val json = JSONObject(String(buildAlarmDismissPayload(alarmId = 7)))

        assertEquals(7, json.getInt("alarmId"))
        assertEquals(1, json.length())
    }

    // ── buildAlarmSnoozePayload (shared with WearSyncPlugin.sendAlarmSnooze) ────────────

    @Test
    fun `buildAlarmSnoozePayload encodes the alarm id and snooze length`() {
        val json = JSONObject(String(buildAlarmSnoozePayload(alarmId = 7, snoozeLengthMinutes = 5)))

        assertEquals(7, json.getInt("alarmId"))
        assertEquals(5, json.getInt("snoozeLengthMinutes"))
        assertEquals(2, json.length())
    }
}
