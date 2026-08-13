// Unit tests for NativeFiredListener's pure staleness/parsing/payload-construction helpers
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain JUnit 4 tests -- no Robolectric/instrumentation. Covers the pure functions
 * [NativeFiredListener] (and the shared [buildAlarmRingPayload] helper it calls) factor out
 * specifically so this staleness/parsing/payload-construction logic is testable independent
 * of [android.content.Context], [NativeEventBus], and Play Services -- mirrors the style of
 * [WearSyncEventQueueTest] and native-bus's own `NativeEventBusTest`.
 */
class NativeFiredListenerTest {

    // ── parseFiredPayload ────────────────────────────────────────────

    @Test
    fun `parseFiredPayload reads id and actualFiredAt from a well-formed payload`() {
        val payload = JSONObject().apply {
            put("id", 42)
            put("actualFiredAt", 1_755_100_800_000L)
        }.toString()

        val result = parseFiredPayload(payload)

        assertEquals(FiredPayload(42, 1_755_100_800_000L), result)
    }

    @Test
    fun `parseFiredPayload ignores unrecognised fields like eventId and handledNatively`() {
        val payload = JSONObject().apply {
            put("id", 7)
            put("actualFiredAt", 1000L)
            put("eventId", "b3f1c2a4-0000-0000-0000-000000000000")
            put("handledNatively", org.json.JSONArray())
        }.toString()

        val result = parseFiredPayload(payload)

        assertEquals(FiredPayload(7, 1000L), result)
    }

    @Test
    fun `parseFiredPayload returns null for malformed JSON`() {
        assertNull(parseFiredPayload("not even json"))
    }

    @Test
    fun `parseFiredPayload returns null when id is missing`() {
        val payload = JSONObject().apply { put("actualFiredAt", 1000L) }.toString()

        assertNull(parseFiredPayload(payload))
    }

    @Test
    fun `parseFiredPayload returns null when id is zero or negative`() {
        val payload = JSONObject().apply {
            put("id", 0)
            put("actualFiredAt", 1000L)
        }.toString()

        assertNull(parseFiredPayload(payload))
    }

    @Test
    fun `parseFiredPayload returns null when actualFiredAt is missing`() {
        val payload = JSONObject().apply { put("id", 5) }.toString()

        assertNull(parseFiredPayload(payload))
    }

    // ── isStale ──────────────────────────────────────────────────────

    @Test
    fun `isStale is false for an event fired just now`() {
        assertFalse(isStale(actualFiredAt = 1_000_000L, now = 1_000_000L))
    }

    @Test
    fun `isStale is false exactly at the staleness window boundary`() {
        assertFalse(isStale(actualFiredAt = 0L, now = STALENESS_WINDOW_MS))
    }

    @Test
    fun `isStale is true one millisecond past the staleness window`() {
        assertTrue(isStale(actualFiredAt = 0L, now = STALENESS_WINDOW_MS + 1))
    }

    @Test
    fun `isStale is true for a long-past event`() {
        assertTrue(isStale(actualFiredAt = 0L, now = 60 * 60 * 1000L))
    }

    // ── resolveAlarmLabel ────────────────────────────────────────────

    @Test
    fun `resolveAlarmLabel finds the matching alarm's label in a FullSync envelope`() {
        val alarmsJson = JSONObject().apply {
            put("type", "FullSync")
            put("currentRevision", 10)
            put(
                "allAlarms",
                org.json.JSONArray().apply {
                    put(JSONObject().apply { put("id", 1); put("label", "Wake up") })
                    put(JSONObject().apply { put("id", 2); put("label", "Gym") })
                },
            )
        }.toString()

        assertEquals("Gym", resolveAlarmLabel(alarmsJson, 2))
    }

    @Test
    fun `resolveAlarmLabel returns empty string when no alarm matches the id`() {
        val alarmsJson = JSONObject().apply {
            put("type", "FullSync")
            put("currentRevision", 10)
            put("allAlarms", org.json.JSONArray().apply { put(JSONObject().apply { put("id", 1); put("label", "Wake up") }) })
        }.toString()

        assertEquals("", resolveAlarmLabel(alarmsJson, 99))
    }

    @Test
    fun `resolveAlarmLabel returns empty string for malformed JSON`() {
        assertEquals("", resolveAlarmLabel("not even json", 1))
    }

    @Test
    fun `resolveAlarmLabel returns empty string when allAlarms is absent`() {
        val alarmsJson = JSONObject().apply { put("type", "UpToDate"); put("currentRevision", 10) }.toString()

        assertEquals("", resolveAlarmLabel(alarmsJson, 1))
    }

    @Test
    fun `resolveAlarmLabel returns empty string when the matching alarm has no label`() {
        val alarmsJson = JSONObject().apply {
            put("type", "FullSync")
            put("currentRevision", 10)
            put("allAlarms", org.json.JSONArray().apply { put(JSONObject().apply { put("id", 1) }) })
        }.toString()

        assertEquals("", resolveAlarmLabel(alarmsJson, 1))
    }

    // ── buildAlarmRingPayload (shared with WearSyncPlugin.sendAlarmRing) ────────────────

    @Test
    fun `buildAlarmRingPayload includes an explicit hour and minute unchanged`() {
        val json = JSONObject(
            String(
                buildAlarmRingPayload(
                    alarmId = 3,
                    label = "Wake up",
                    hour = 7,
                    minute = 30,
                    snoozeLengthMinutes = 5,
                    is24Hour = true,
                    is24HourKnown = true,
                ),
            ),
        )

        assertEquals(3, json.getInt("alarmId"))
        assertEquals("Wake up", json.getString("label"))
        assertEquals(7, json.getInt("hour"))
        assertEquals(30, json.getInt("minute"))
        assertEquals(5, json.getInt("snoozeLengthMinutes"))
        assertTrue(json.getBoolean("is24Hour"))
        assertTrue(json.getBoolean("is24HourKnown"))
    }

    @Test
    fun `buildAlarmRingPayload falls back to the current device time when hour and minute are null`() {
        val json = JSONObject(
            String(
                buildAlarmRingPayload(
                    alarmId = 3,
                    label = "",
                    hour = null,
                    minute = null,
                    snoozeLengthMinutes = 10,
                    is24Hour = false,
                    is24HourKnown = false,
                ),
            ),
        )

        val cal = java.util.Calendar.getInstance()
        // Both resolved within the same test run, so equal to within a minute of drift.
        assertEquals(cal.get(java.util.Calendar.HOUR_OF_DAY), json.getInt("hour"))
    }
}
