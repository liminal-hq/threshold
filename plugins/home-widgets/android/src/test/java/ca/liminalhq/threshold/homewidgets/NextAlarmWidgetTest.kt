// Tests the pure time-formatting and size-bucket-selection logic behind the widget's render path
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.homewidgets

import java.time.LocalDateTime
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Test

class NextAlarmWidgetTest {
    private fun epochMillisAt(hour: Int, minute: Int, offsetHours: Int = 0): Long {
        return LocalDateTime.of(2026, 3, 14, hour, minute)
            .toInstant(ZoneOffset.ofHours(offsetHours))
            .toEpochMilli()
    }

    @Test
    fun `formats a morning time in 12-hour with an AM suffix`() {
        val millis = epochMillisAt(7, 14)
        assertEquals("7:14 AM", formatWidgetTime(millis, is24Hour = false, zoneId = ZoneOffset.UTC))
    }

    @Test
    fun `formats an afternoon time in 12-hour with a PM suffix`() {
        val millis = epochMillisAt(19, 5)
        assertEquals("7:05 PM", formatWidgetTime(millis, is24Hour = false, zoneId = ZoneOffset.UTC))
    }

    @Test
    fun `pads single-digit minutes in 12-hour format`() {
        val millis = epochMillisAt(9, 3)
        assertEquals("9:03 AM", formatWidgetTime(millis, is24Hour = false, zoneId = ZoneOffset.UTC))
    }

    @Test
    fun `midnight renders as 12 AM in 12-hour format`() {
        val millis = epochMillisAt(0, 0)
        assertEquals("12:00 AM", formatWidgetTime(millis, is24Hour = false, zoneId = ZoneOffset.UTC))
    }

    @Test
    fun `formats a time in 24-hour with a zero-padded hour`() {
        val millis = epochMillisAt(7, 14)
        assertEquals("07:14", formatWidgetTime(millis, is24Hour = true, zoneId = ZoneOffset.UTC))
    }

    @Test
    fun `midday renders as 12 PM in 12-hour format`() {
        val millis = epochMillisAt(12, 0)
        assertEquals("12:00 PM", formatWidgetTime(millis, is24Hour = false, zoneId = ZoneOffset.UTC))
    }

    @Test
    fun `the same instant renders a different local time in a different zone`() {
        val millis = epochMillisAt(23, 30, offsetHours = 0)
        assertEquals("11:30 PM", formatWidgetTime(millis, is24Hour = false, zoneId = ZoneOffset.UTC))
        assertEquals("7:30 PM", formatWidgetTime(millis, is24Hour = false, zoneId = ZoneOffset.ofHours(-4)))
    }

    @Test
    fun `selects the hero bucket at and above both thresholds at the baseline font scale`() {
        assertEquals(WidgetLayoutBucket.HERO, selectWidgetLayoutBucket(180, 100, fontScale = 1.0f))
        assertEquals(WidgetLayoutBucket.HERO, selectWidgetLayoutBucket(250, 110, fontScale = 1.0f))
    }

    @Test
    fun `selects the narrow bucket below the 180dp width threshold at the baseline font scale`() {
        assertEquals(WidgetLayoutBucket.NARROW, selectWidgetLayoutBucket(179, 110, fontScale = 1.0f))
        assertEquals(WidgetLayoutBucket.NARROW, selectWidgetLayoutBucket(110, 110, fontScale = 1.0f))
    }

    @Test
    fun `selects the narrow bucket below the 100dp height threshold even when wide at the baseline font scale`() {
        assertEquals(WidgetLayoutBucket.NARROW, selectWidgetLayoutBucket(250, 99, fontScale = 1.0f))
        assertEquals(WidgetLayoutBucket.NARROW, selectWidgetLayoutBucket(320, 40, fontScale = 1.0f))
    }

    @Test
    fun `selects the narrow bucket when a doubled font scale outgrows the hero-sized cell`() {
        assertEquals(WidgetLayoutBucket.NARROW, selectWidgetLayoutBucket(250, 110, fontScale = 2.0f))
    }

    @Test
    fun `selects the hero bucket when the cell scales up along with a doubled font scale`() {
        assertEquals(WidgetLayoutBucket.HERO, selectWidgetLayoutBucket(360, 200, fontScale = 2.0f))
    }
}
