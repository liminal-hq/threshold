// Typed TypeScript bindings for the alarm-manager plugin's commands
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

export interface CancelRequest {
	id: number;
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

export async function cancel(payload: CancelRequest): Promise<void> {
	await invoke('plugin:alarm-manager|cancel', { payload });
}

/** Opens the Android system alarm sound picker. */
export async function pickAlarmSound(options: PickAlarmSoundOptions): Promise<PickedAlarmSound> {
	return await invoke<PickedAlarmSound>('plugin:alarm-manager|pick_alarm_sound', { options });
}

export async function stopRinging(): Promise<void> {
	await invoke('plugin:alarm-manager|stop_ringing');
}

/** Whether Android will actually honour the ringing notification's full-screen intent. */
export async function checkFullScreenIntentPermission(): Promise<boolean> {
	const result = await invoke<{ granted: boolean }>(
		'plugin:alarm-manager|check_full_screen_intent_permission',
	);
	return result.granted;
}

/** Opens the OS settings screen for the full-screen-intent special permission (Android 14+). */
export async function openFullScreenIntentSettings(): Promise<void> {
	await invoke('plugin:alarm-manager|open_full_screen_intent_settings');
}

/**
 * The alarm ID currently ringing natively, if any -- a fallback for detecting an active alarm
 * outside the normal full-screen-intent deep-link launch path.
 */
export async function getCurrentlyRingingAlarm(): Promise<number | null> {
	const result = await invoke<{ id: number | null }>(
		'plugin:alarm-manager|get_currently_ringing_alarm',
	);
	return result.id;
}
