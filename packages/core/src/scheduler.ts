import { Alarm, AlarmMode, DayOfWeek } from './types';
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, isBefore, isAfter, getDay, addSeconds } from 'date-fns';

/**
 * Canadian Spelling:
 * This module defines the scheduling behaviour for the alarms.
 */

const MIN_LEAD_SECONDS = 30; // If enabling inside a window, give at least 30s delay

export function calculateNextTrigger(alarm: Alarm, now: Date = new Date()): number | null {
  if (!alarm.enabled || alarm.activeDays.length === 0) {
    return null;
  }

  // Sort active days to ensure correct rotation behaviour
  const sortedDays = [...alarm.activeDays].sort((a, b) => a - b);

  // Look ahead up to 7 days (including today) to find the next active day
  for (let i = 0; i <= 7; i++) {
    const candidateDate = addDays(now, i);
    const candidateDayOfWeek = getDay(candidateDate) as DayOfWeek;

    if (sortedDays.includes(candidateDayOfWeek)) {
      // Check if this specific date can support a trigger in the future
      const trigger = getTriggerForDate(alarm, candidateDate, now);
      if (trigger !== null) {
        return trigger;
      }
    }
  }

  return null;
}

function getTriggerForDate(alarm: Alarm, date: Date, now: Date): number | null {
  if (alarm.mode === AlarmMode.Fixed) {
    return getFixedTrigger(alarm, date, now);
  } else {
    return getRandomWindowTrigger(alarm, date, now);
  }
}

function getFixedTrigger(alarm: Alarm, date: Date, now: Date): number | null {
  if (!alarm.fixedTime) return null;

  const [hours, minutes] = parseTime(alarm.fixedTime);
  let triggerTime = setTime(date, hours, minutes);

  // If the calculated trigger time is in the past (strictly), it's not valid for *this* date
  // unless we are looking at a future date (which is handled by the loop in calculateNextTrigger)
  if (isBefore(triggerTime, now) || triggerTime.getTime() === now.getTime()) {
    return null;
  }

  return triggerTime.getTime();
}

function getRandomWindowTrigger(alarm: Alarm, date: Date, now: Date): number | null {
  if (!alarm.windowStart || !alarm.windowEnd) return null;

  const [startHours, startMinutes] = parseTime(alarm.windowStart);
  const [endHours, endMinutes] = parseTime(alarm.windowEnd);

  const windowStart = setTime(date, startHours, startMinutes);
  let windowEnd = setTime(date, endHours, endMinutes);

  // Handle midnight crossing: if end < start, end is on the next day
  if (isBefore(windowEnd, windowStart)) {
    windowEnd = addDays(windowEnd, 1);
  }

  // Determine the effective sampling range [sampleStart, windowEnd]
  let sampleStart = windowStart;

  // Case 1: The entire window is in the past relative to 'now'
  if (isAfter(now, windowEnd)) {
    return null;
  }

  // Case 2: We are currently INSIDE the window or BEFORE the window
  if (isAfter(now, windowStart)) {
    // We are inside the window (since we are before windowEnd).
    // The behaviour should be: sample from max(now + MIN_LEAD, windowStart)
    const earliestAllowed = addSeconds(now, MIN_LEAD_SECONDS);

    if (isAfter(earliestAllowed, windowEnd)) {
      // Too late to schedule in this window with the lead time
      return null;
    }
    sampleStart = earliestAllowed;
  }
  // Else: We are strictly before the window (now <= windowStart). sampleStart remains windowStart.

  // Random sampling
  const startMillis = sampleStart.getTime();
  const endMillis = windowEnd.getTime();

  // Uniform distribution
  // Note: In a real app, if a trigger is already persisted for this window, we should return that instead of re-rolling.
  // However, this function calculates a *new* trigger. The UI layer checks persistence first.
  const randomOffset = Math.random() * (endMillis - startMillis);
  return Math.floor(startMillis + randomOffset);
}

// Helpers

function parseTime(timeStr: string): [number, number] {
  const parts = timeStr.split(':').map(Number);
  return [parts[0], parts[1]];
}

function setTime(date: Date, hours: number, minutes: number): Date {
  let d = setHours(date, hours);
  d = setMinutes(d, minutes);
  d = setSeconds(d, 0);
  d = setMilliseconds(d, 0);
  return d;
}
