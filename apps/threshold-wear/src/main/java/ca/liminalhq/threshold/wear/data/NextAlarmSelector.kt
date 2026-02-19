// Selects the next upcoming enabled alarm relative to current local time
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.data

import java.time.DayOfWeek
import java.time.LocalDateTime

private const val SEARCH_DAYS = 7

/**
 * Returns the enabled alarm whose next occurrence is soonest from [now].
 *
 * If [WatchAlarm.daysOfWeek] is empty, the alarm is treated as daily.
 * Day values use `0..6` where `0 = Sunday`, matching the phone model.
 */
fun findNextUpcomingAlarm(
    alarms: List<WatchAlarm>,
    now: LocalDateTime = LocalDateTime.now(),
): WatchAlarm? {
    return alarms
        .asSequence()
        .filter { it.enabled }
        .mapNotNull { alarm ->
            val nextOccurrence = nextOccurrenceMinutesFromNow(alarm, now) ?: return@mapNotNull null
            alarm to nextOccurrence
        }
        .minByOrNull { (_, minutesFromNow) -> minutesFromNow }
        ?.first
}

private fun nextOccurrenceMinutesFromNow(
    alarm: WatchAlarm,
    now: LocalDateTime,
): Long? {
    val nowMinutes = now.hour * 60 + now.minute
    val alarmMinutes = alarm.hour * 60 + alarm.minute
    val todayIndex = toSundayZeroDayIndex(now.dayOfWeek)
    val activeDays = alarm.daysOfWeek.toSet()

    // Today through next 7 days guarantees one full weekly cycle.
    for (dayOffset in 0..SEARCH_DAYS) {
        val dayIndex = (todayIndex + dayOffset) % 7
        val dayIsActive = activeDays.isEmpty() || activeDays.contains(dayIndex)
        if (!dayIsActive) continue

        val minuteOffset = when {
            dayOffset > 0 -> (dayOffset * 1440) + (alarmMinutes - nowMinutes)
            alarmMinutes >= nowMinutes -> alarmMinutes - nowMinutes
            else -> continue
        }

        if (minuteOffset >= 0) {
            return minuteOffset.toLong()
        }
    }

    return null
}

private fun toSundayZeroDayIndex(dayOfWeek: DayOfWeek): Int {
    return if (dayOfWeek == DayOfWeek.SUNDAY) 0 else dayOfWeek.value
}
