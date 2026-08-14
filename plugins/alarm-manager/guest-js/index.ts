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

/**
 * Stops the native ringing service (audio, vibration, notification). `alarmId`, when supplied,
 * threads the real alarm id through to `AlarmRingingService`'s `ACTION_DISMISS` intent so
 * `AlarmManagerPlugin.notifyAlarmDismissed` gets a usable id -- previously the in-app dismiss
 * path here always omitted it, so it silently produced no native dismiss event at all (issue
 * #255 Phase 4A). Callers that don't know which alarm they're stopping (the legacy ID-less JS
 * notification-action fallback, and in-app snooze -- see `AlarmManagerService.stopRinging`'s
 * own doc comment for why snooze deliberately doesn't pass one) omit it, unchanged.
 */
export async function stopRinging(alarmId?: number): Promise<void> {
	await invoke('plugin:alarm-manager|stop_ringing', { alarmId: alarmId ?? null });
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

/** Whether Android will schedule this app's alarms exactly rather than degrading to a window. */
export async function checkExactAlarmPermission(): Promise<boolean> {
	const result = await invoke<{ granted: boolean }>(
		'plugin:alarm-manager|check_exact_alarm_permission',
	);
	return result.granted;
}

/** Opens the OS settings screen for the exact-alarm-scheduling special permission (Android 12+). */
export async function openExactAlarmSettings(): Promise<void> {
	await invoke('plugin:alarm-manager|open_exact_alarm_settings');
}

/** Whether this app is exempted from Doze/App Standby battery optimization. */
export async function checkBatteryOptimizationExemption(): Promise<boolean> {
	const result = await invoke<{ granted: boolean }>(
		'plugin:alarm-manager|check_battery_optimization_exemption',
	);
	return result.granted;
}

/** Opens the OS settings screen to request a battery-optimization exemption. */
export async function openBatteryOptimizationSettings(): Promise<void> {
	await invoke('plugin:alarm-manager|open_battery_optimization_settings');
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
