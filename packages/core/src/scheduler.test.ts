import { describe, it, expect } from 'vitest';
import { calculateNextTrigger } from './scheduler';
import { Alarm, AlarmMode, DayOfWeek } from './types';
import { addDays, setHours, setMinutes } from 'date-fns';

describe('Scheduler Logic', () => {
	const baseDate = new Date(2023, 10, 1, 10, 0, 0); // Nov 1 2023, 10:00 AM (Wednesday)
	// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

	describe('Fixed Alarm', () => {
		it('schedules for today if time is in future', () => {
			const alarm: Alarm = {
				id: 1,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '12:00',
				activeDays: [0, 1, 2, 3, 4, 5, 6], // Everyday
			};

			const next = calculateNextTrigger(alarm, baseDate); // 10am -> 12pm
			expect(next).toBeDefined();
			const date = new Date(next!);
			expect(date.getHours()).toBe(12);
			expect(date.getDate()).toBe(1); // Today
		});

		it('schedules for tomorrow if time is in past', () => {
			const alarm: Alarm = {
				id: 1,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '09:00', // 9am (past)
				activeDays: [0, 1, 2, 3, 4, 5, 6],
			};

			const next = calculateNextTrigger(alarm, baseDate); // 10am -> 9am tomorrow
			expect(next).toBeDefined();
			const date = new Date(next!);
			expect(date.getDate()).toBe(2); // Tomorrow
			expect(date.getHours()).toBe(9);
		});

		it('respects active days (skips Thursday)', () => {
			const alarm: Alarm = {
				id: 1,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '12:00',
				activeDays: [3, 5], // Wed, Fri (Skip Thu)
			};

			// Case 1: It's Wed 10am, target Wed 12pm. Should be today.
			let next = calculateNextTrigger(alarm, baseDate);
			expect(new Date(next!).getDate()).toBe(1);

			// Case 2: It's Wed 1pm, target Wed 12pm. Should skip Thu, go to Fri.
			const pastLunch = setHours(baseDate, 13);
			next = calculateNextTrigger(alarm, pastLunch);
			const date = new Date(next!);
			expect(date.getDate()).toBe(3); // Nov 1 -> Nov 3 (Friday)
			expect(date.getHours()).toBe(12);
		});
	});

	describe('Random Window Alarm', () => {
		it('schedules randomly within window today', () => {
			const alarm: Alarm = {
				id: 2,
				enabled: true,
				mode: AlarmMode.RandomWindow,
				windowStart: '12:00',
				windowEnd: '14:00',
				activeDays: [3], // Wed only
			};

			const next = calculateNextTrigger(alarm, baseDate); // 10am
			expect(next).toBeDefined();
			const date = new Date(next!);
			expect(date.getDate()).toBe(1);
			expect(date.getSeconds()).toBe(0);
			expect(date.getHours()).toBeGreaterThanOrEqual(12);
			expect(date.getHours()).toBeLessThan(14); // strict less than 14:00 usually, or <= 13:59
		});

		it('handles midnight crossing (23:00 to 02:00)', () => {
			const alarm: Alarm = {
				id: 2,
				enabled: true,
				mode: AlarmMode.RandomWindow,
				windowStart: '23:00',
				windowEnd: '02:00',
				activeDays: [3], // Wed
			};

			const next = calculateNextTrigger(alarm, baseDate); // Wed 10am
			expect(next).toBeDefined();
			const date = new Date(next!);
			expect(date.getSeconds()).toBe(0);

			// Could be Wed 23:xx or Thu 01:xx
			// But start is Wed 23:00.
			expect(date.getTime()).toBeGreaterThanOrEqual(setHours(baseDate, 23).getTime());

			// Max bound is Thu 02:00
			const maxBound = setHours(addDays(baseDate, 1), 2);
			expect(date.getTime()).toBeLessThan(maxBound.getTime());
		});

		it('schedules for next active day if window missed', () => {
			const alarm: Alarm = {
				id: 2,
				enabled: true,
				mode: AlarmMode.RandomWindow,
				windowStart: '08:00',
				windowEnd: '09:00',
				activeDays: [3, 4], // Wed, Thu
			};

			// It is Wed 10am. Window 8-9am is missed.
			// Should schedule for Thu 8-9am.
			const next = calculateNextTrigger(alarm, baseDate);
			expect(next).toBeDefined();
			const date = new Date(next!);
			expect(date.getDate()).toBe(2); // Thu Nov 2
			expect(date.getSeconds()).toBe(0);
			expect(date.getHours()).toBeGreaterThanOrEqual(8);
			expect(date.getHours()).toBeLessThan(9);
		});

		it('handles enabling *inside* the window', () => {
			const alarm: Alarm = {
				id: 2,
				enabled: true,
				mode: AlarmMode.RandomWindow,
				windowStart: '09:00',
				windowEnd: '11:00',
				activeDays: [3], // Wed
			};

			// It is Wed 10:00am. Window is 9-11.
			// Should schedule between 10:00:30 and 11:00.
			const next = calculateNextTrigger(alarm, baseDate);
			expect(next).toBeDefined();
			const date = new Date(next!);

			expect(date.getDate()).toBe(1); // Today
			expect(date.getSeconds()).toBe(0);
			expect(date.getTime()).toBeGreaterThan(baseDate.getTime()); // After now
		});

		it('skips today if the window already fired', () => {
			const alarm: Alarm = {
				id: 2,
				enabled: true,
				mode: AlarmMode.RandomWindow,
				windowStart: '09:00',
				windowEnd: '11:00',
				activeDays: [3], // Wed
				lastFiredAt: setMinutes(setHours(baseDate, 10), 5).getTime(), // 10:05am
			};

			const next = calculateNextTrigger(alarm, baseDate); // 10am
			expect(next).toBeDefined();
			const date = new Date(next!);
			expect(date.getDate()).toBe(8); // Wed Nov 8
			expect(date.getSeconds()).toBe(0);
			expect(date.getHours()).toBeGreaterThanOrEqual(9);
			expect(date.getHours()).toBeLessThan(11);
		});

		it('skips an overnight window after it already fired', () => {
			const overnightAlarm: Alarm = {
				id: 2,
				enabled: true,
				mode: AlarmMode.RandomWindow,
				windowStart: '23:00',
				windowEnd: '02:00',
				activeDays: [3], // Wed
				lastFiredAt: new Date(2023, 10, 2, 0, 30, 0).getTime(), // Thu 00:30
			};

			const now = new Date(2023, 10, 2, 1, 0, 0); // Thu 01:00
			const next = calculateNextTrigger(overnightAlarm, now);
			expect(next).toBeDefined();
			const date = new Date(next!);
			expect(date.getSeconds()).toBe(0);

			const nextWindowStart = setHours(new Date(2023, 10, 8, 0, 0, 0), 23); // Wed Nov 8 23:00
			const nextWindowEnd = setHours(addDays(new Date(2023, 10, 8, 0, 0, 0), 1), 2); // Thu Nov 9 02:00

			expect(date.getTime()).toBeGreaterThanOrEqual(nextWindowStart.getTime());
			expect(date.getTime()).toBeLessThan(nextWindowEnd.getTime());
		});
	});
});
