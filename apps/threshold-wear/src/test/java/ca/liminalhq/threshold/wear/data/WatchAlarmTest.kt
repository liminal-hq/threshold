// Unit tests for WatchAlarm JSON parsing and serialisation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchAlarmTest {

    @Test
    fun `fromJson parses all fields`() {
        val json = JSONObject("""
            {
                "id": 42,
                "hour": 7,
                "minute": 30,
                "label": "Morning alarm",
                "enabled": true,
                "daysOfWeek": [1, 2, 3, 4, 5]
            }
        """)

        val alarm = WatchAlarm.fromJson(json)

        assertEquals(42, alarm.id)
        assertEquals(7, alarm.hour)
        assertEquals(30, alarm.minute)
        assertEquals("Morning alarm", alarm.label)
        assertTrue(alarm.enabled)
        assertEquals(listOf(1, 2, 3, 4, 5), alarm.daysOfWeek)
    }

    @Test
    fun `fromJson handles missing label`() {
        val json = JSONObject("""
            {
                "id": 1,
                "hour": 6,
                "minute": 0,
                "enabled": false
            }
        """)

        val alarm = WatchAlarm.fromJson(json)

        assertEquals("", alarm.label)
        assertEquals(false, alarm.enabled)
    }

    @Test
    fun `fromJson handles missing daysOfWeek`() {
        val json = JSONObject("""
            {
                "id": 1,
                "hour": 8,
                "minute": 15,
                "label": "Test",
                "enabled": true
            }
        """)

        val alarm = WatchAlarm.fromJson(json)

        assertTrue(alarm.daysOfWeek.isEmpty())
    }

    @Test
    fun `timeDisplay formats correctly`() {
        val alarm = WatchAlarm(id = 1, hour = 7, minute = 5, label = "", enabled = true)
        assertEquals("07:05", alarm.timeDisplay)
    }

    @Test
    fun `timeDisplay pads single digits`() {
        val alarm = WatchAlarm(id = 1, hour = 0, minute = 0, label = "", enabled = true)
        assertEquals("00:00", alarm.timeDisplay)
    }

    @Test
    fun `toJson round-trips correctly`() {
        val original = WatchAlarm(
            id = 99,
            hour = 23,
            minute = 59,
            label = "Bedtime",
            enabled = false,
            daysOfWeek = listOf(0, 6),
        )

        val json = original.toJson()
        val roundTripped = WatchAlarm.fromJson(json)

        assertEquals(original, roundTripped)
    }

    @Test
    fun `toJson includes all fields`() {
        val alarm = WatchAlarm(
            id = 5,
            hour = 12,
            minute = 0,
            label = "Noon",
            enabled = true,
            daysOfWeek = listOf(1, 2, 3),
        )

        val json = alarm.toJson()

        assertEquals(5, json.getInt("id"))
        assertEquals(12, json.getInt("hour"))
        assertEquals(0, json.getInt("minute"))
        assertEquals("Noon", json.getString("label"))
        assertEquals(true, json.getBoolean("enabled"))
        assertEquals(3, json.getJSONArray("daysOfWeek").length())
    }
}
