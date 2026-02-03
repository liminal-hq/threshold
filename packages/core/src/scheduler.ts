import { Alarm, AlarmMode, DayOfWeek } from './types';
import {
	addDays,
	setHours,
	setMinutes,
	setSeconds,
	setMilliseconds,
	isBefore,
	isAfter,
	getDay,
	addSeconds,
	subDays,
} from 'date-fns';

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

	// EDGE CASE: Overnight Window Check for "Yesterday"
	// If the window crosses midnight, and we are currently in the early morning (e.g. 01:00),
	// we might effectively be in the window that started "Yesterday".
	// We should check "Yesterday" first if it was an active day.
	if (alarm.mode === AlarmMode.RandomWindow && alarm.windowStart && alarm.windowEnd) {
		const [startH, startM] = parseTime(alarm.windowStart);
		const [endH, endM] = parseTime(alarm.windowEnd);
		// If window crosses midnight (start > end)
		if (startH > endH || (startH === endH && startM > endM)) {
			const yesterday = subDays(now, 1);
			const yesterdayDayOfWeek = getDay(yesterday) as DayOfWeek;
			if (sortedDays.includes(yesterdayDayOfWeek)) {
				// Check if we are still inside yesterday's window
				const trigger = getRandomWindowTrigger(alarm, yesterday, now);
				if (trigger !== null) return trigger;
			}
		}
	}

	// Look ahead up to 7 days (including today) to find the next active day
	for (let i = 0; i <= 7; i++) {
		const candidateDate = addDays(now, i);
		const candidateDayOfWeek = getDay(candidateDate) as DayOfWeek;

		// console.log(`[Scheduler] Checking date ${candidateDate.toDateString()} (Day: ${candidateDayOfWeek}). ActiveDays: [${sortedDays}]`);

		if (sortedDays.includes(candidateDayOfWeek)) {
			// Check if this specific date can support a trigger in the future
			const trigger = getTriggerForDate(alarm, candidateDate, now);
			if (trigger !== null) {
                // console.log(`[Scheduler] Found trigger: ${new Date(trigger).toLocaleString()}`);
				return trigger;
			} else {
                // console.log(`[Scheduler] Date matches active days, but time is in past.`);
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
        // console.log(`[Scheduler] FixedTrigger ${triggerTime.toLocaleString()} is before Now ${now.toLocaleString()}`);
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

	// One-shot default: if the window already fired, skip scheduling within it.
	// TODO: Add a future continuousWindow flag to allow re-arming within the same window.
	if (wasLastFiredInWindow(alarm, windowStart, windowEnd)) {
		console.log(
			`[Scheduler] Skipping window (already fired). lastFiredAt=${alarm.lastFiredAt} windowStart=${windowStart.toISOString()} windowEnd=${windowEnd.toISOString()}`,
		);
		return null;
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

function wasLastFiredInWindow(alarm: Alarm, windowStart: Date, windowEnd: Date): boolean {
	if (!alarm.lastFiredAt) return false;

	const lastFired = new Date(alarm.lastFiredAt);
	const lastFiredMillis = lastFired.getTime();

	console.log(
		`[Scheduler] lastFiredAt check: lastFired=${lastFired.toISOString()} windowStart=${windowStart.toISOString()} windowEnd=${windowEnd.toISOString()}`,
	);
	return lastFiredMillis >= windowStart.getTime() && lastFiredMillis < windowEnd.getTime();
}
