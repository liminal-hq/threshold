// Typed TypeScript bindings for the os-prefs plugin's commands
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

export interface TimeFormatResponse {
	is24Hour: boolean;
}

export interface AnimatorDurationScaleResponse {
	scale: number;
}

export async function getTimeFormat(): Promise<TimeFormatResponse> {
	return await invoke<TimeFormatResponse>('plugin:os-prefs|get_time_format');
}

/** Android's Developer Options "Animator duration scale" (default 1). Desktop/iOS always report 1. */
export async function getAnimatorDurationScale(): Promise<AnimatorDurationScaleResponse> {
	return await invoke<AnimatorDurationScaleResponse>('plugin:os-prefs|get_animator_duration_scale');
}

/** Opens the OS notification settings screen for this app. */
export async function openNotificationSettings(): Promise<void> {
	await invoke('plugin:os-prefs|open_notification_settings');
}
