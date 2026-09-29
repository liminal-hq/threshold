// Unit tests for the upcoming-alarm reminder's delivery decision, notification id, and persisted-reminder JSON
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import com.plugin.alarmmanager.UpcomingAlarmNotifier.Delivery
import com.plugin.alarmmanager.UpcomingAlarmNotifier.Reminder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Plain JUnit 4 tests against the pure seams of [UpcomingAlarmNotifier] (issue #325) -- the AlarmManager/NotificationManager calls need a real Context, which this module's host-JVM tests don't have, so what's covered here is the logic deciding *what* those calls should be.
 */
class UpcomingAlarmNotifierTest {

    private val now = 1_800_000_000_000L
    private val minute = 60_000L

    private fun reminder(notifyAt: Long, triggerAt: Long) = Reminder(
        alarmId = 7,
        notifyAt = notifyAt,
        triggerAt = triggerAt,
        title = "Upcoming alarm",
        body = "Next alarm \"Work\" at 7:30 AM",
        snoozeLabel = "Snooze (10m)",
    )

    // --- deliveryFor ---------------------------------------------------------------------------

    @Test
    fun `waits when the lead time is still in the future`() {
        assertEquals(Delivery.WAIT, UpcomingAlarmNotifier.deliveryFor(reminder(now + minute, now + 11 * minute), now))
    }

    @Test
    fun `posts immediately when the lead time has passed but the alarm has not rung yet`() {
        assertEquals(Delivery.POST_NOW, UpcomingAlarmNotifier.deliveryFor(reminder(now - minute, now + 9 * minute), now))
    }

    @Test
    fun `posts immediately at exactly the notify time`() {
        assertEquals(Delivery.POST_NOW, UpcomingAlarmNotifier.deliveryFor(reminder(now, now + 10 * minute), now))
    }

    @Test
    fun `drops the reminder once the alarm itself is due`() {
        // e.g. a reboot that outlasted both the lead time and the alarm -- the ringing notification has taken over, so an "upcoming" reminder would be nonsense.
        assertEquals(Delivery.DROP, UpcomingAlarmNotifier.deliveryFor(reminder(now - 20 * minute, now - 10 * minute), now))
        assertEquals(Delivery.DROP, UpcomingAlarmNotifier.deliveryFor(reminder(now - 10 * minute, now), now))
    }

    // --- notificationIdFor ---------------------------------------------------------------------

    @Test
    fun `notification id matches the frontend's offset so legacy cleanup targets the same id`() {
        assertEquals(1_000_012, UpcomingAlarmNotifier.notificationIdFor(12))
    }

    // --- Reminder JSON -------------------------------------------------------------------------

    @Test
    fun `a reminder round-trips through its persisted JSON`() {
        val original = reminder(now + minute, now + 11 * minute)
        assertEquals(original, Reminder.fromJson(original.toJson()))
    }

    @Test
    fun `unreadable persisted JSON yields null rather than throwing`() {
        // A corrupt or older-shaped entry must never crash the boot receiver's restore pass.
        assertNull(Reminder.fromJson("not json"))
        assertNull(Reminder.fromJson("{\"alarmId\": 1}"))
    }
}
