// Shared alarm types used by the app
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday, 1=Monday, etc.

export enum AlarmMode {
	Fixed = 'FIXED',
	Window = 'WINDOW',
}

export interface Alarm {
	id: number;
	label?: string;
	enabled: boolean;
	mode: AlarmMode;

	// Fixed Mode
	fixedTime?: string; // HH:mm

	// Random Window Mode
	windowStart?: string; // HH:mm
	windowEnd?: string; // HH:mm

	// Recurrence: Array of days (0-6) where the alarm is active
	activeDays: DayOfWeek[];

	// Sound
	soundUri?: string | null;
	soundTitle?: string | null;

	// Persistence
	nextTrigger?: number; // Epoch millis
	lastFiredAt?: number; // Epoch millis
}
