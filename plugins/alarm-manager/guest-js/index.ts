// Typed TypeScript bindings for the alarm-manager plugin's commands
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

export interface ScheduleRequest {
	id: number;
	triggerAt: number;
	soundUri?: string | null;
}

export interface CancelRequest {
	id: number;
}

export interface ImportedAlarm {
	id: number;
	hour: number;
	minute: number;
	label: string;
	/** Days of week this alarm is active on, 0=Sunday..6=Saturday. Always non-empty. */
	activeDays: number[];
	/** Epoch millis of the originally-computed one-shot occurrence, for staleness checks. */
	triggerAt: number;
}

export interface PickAlarmSoundOptions {
	existingUri?: string | null;
	title?: string;
	showSilent?: boolean;
	showDefault?: boolean;
}

export interface PickedAlarmSound {
	uri: string | null;
	isSilent: boolean;
	title: string | null;
}

export async function schedule(payload: ScheduleRequest): Promise<void> {
	await invoke('plugin:alarm-manager|schedule', { payload });
}

export async function cancel(payload: CancelRequest): Promise<void> {
	await invoke('plugin:alarm-manager|cancel', { payload });
}

/** Native alarms created outside the app (e.g. via a "Set Alarm" intent), pending import. */
export async function getLaunchArgs(): Promise<ImportedAlarm[]> {
	return (await invoke<ImportedAlarm[]>('plugin:alarm-manager|get_launch_args')) ?? [];
}

/** Opens the Android system alarm sound picker. */
export async function pickAlarmSound(options: PickAlarmSoundOptions): Promise<PickedAlarmSound> {
	return await invoke<PickedAlarmSound>('plugin:alarm-manager|pick_alarm_sound', { options });
}

export async function stopRinging(): Promise<void> {
	await invoke('plugin:alarm-manager|stop_ringing');
}
