// Unit tests for selecting the next upcoming enabled watch alarm
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.data

import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NextAlarmSelectorTest {

    @Test
    fun `selects later alarm today instead of earliest clock time`() {
        val alarms = listOf(
            WatchAlarm(id = 1, hour = 7, minute = 0, label = "Morning", enabled = true),
            WatchAlarm(id = 2, hour = 22, minute = 0, label = "Evening", enabled = true),
        )

        val now = LocalDateTime.of(2026, 2, 18, 20, 0)
        val next = findNextUpcomingAlarm(alarms, now)

        assertEquals(2, next?.id)
    }

    @Test
    fun `rolls over to tomorrow when today's alarm time has passed`() {
        val alarms = listOf(
            WatchAlarm(id = 1, hour = 7, minute = 0, label = "Daily", enabled = true),
        )

        val now = LocalDateTime.of(2026, 2, 18, 20, 0)
        val next = findNextUpcomingAlarm(alarms, now)

        assertEquals(1, next?.id)
    }

    @Test
    fun `honours active weekdays when selecting next alarm`() {
        val weekdayOnly = WatchAlarm(
            id = 1,
            hour = 8,
            minute = 0,
            label = "Weekday",
            enabled = true,
            daysOfWeek = listOf(1, 2, 3, 4, 5), // Monday-Friday
        )
        val saturdayAlarm = WatchAlarm(
            id = 2,
            hour = 9,
            minute = 0,
            label = "Saturday",
            enabled = true,
            daysOfWeek = listOf(6),
        )

        val now = LocalDateTime.of(2026, 2, 21, 7, 0) // Saturday
        val next = findNextUpcomingAlarm(listOf(weekdayOnly, saturdayAlarm), now)

        assertEquals(2, next?.id)
    }

    @Test
    fun `returns null when no enabled alarms exist`() {
        val alarms = listOf(
            WatchAlarm(id = 1, hour = 7, minute = 0, label = "Off", enabled = false),
        )

        val next = findNextUpcomingAlarm(alarms, LocalDateTime.of(2026, 2, 18, 12, 0))

        assertNull(next)
    }
}
