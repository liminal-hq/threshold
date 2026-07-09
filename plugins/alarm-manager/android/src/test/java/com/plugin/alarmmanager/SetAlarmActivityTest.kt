// Tests the SET_ALARM EXTRA_DAYS -> Threshold activeDays conversion
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import org.junit.Assert.assertEquals
import org.junit.Test

class SetAlarmActivityTest {
    @Test
    fun `converts a single requested day from Calendar numbering to Threshold numbering`() {
        // Calendar.MONDAY = 2 -> Threshold's 1 (0=Sunday..6=Saturday)
        assertEquals(listOf(1), resolveActiveDays(listOf(2), fallbackCalendarDay = 1))
    }

    @Test
    fun `converts multiple requested days preserving order`() {
        // Calendar.SUNDAY=1, MONDAY=2, SATURDAY=7 -> Threshold 0, 1, 6
        assertEquals(listOf(0, 1, 6), resolveActiveDays(listOf(1, 2, 7), fallbackCalendarDay = 1))
    }

    @Test
    fun `falls back to the resolved occurrence's weekday when requestedDays is null`() {
        // Calendar.WEDNESDAY = 4 -> Threshold's 3
        assertEquals(listOf(3), resolveActiveDays(null, fallbackCalendarDay = 4))
    }

    @Test
    fun `falls back to the resolved occurrence's weekday when requestedDays is empty`() {
        assertEquals(listOf(3), resolveActiveDays(emptyList(), fallbackCalendarDay = 4))
    }

    @Test
    fun `boundary days convert correctly at both ends of the week`() {
        // Calendar.SUNDAY(1) -> 0, Calendar.SATURDAY(7) -> 6
        assertEquals(listOf(0), resolveActiveDays(listOf(1), fallbackCalendarDay = 1))
        assertEquals(listOf(6), resolveActiveDays(listOf(7), fallbackCalendarDay = 1))
    }
}
