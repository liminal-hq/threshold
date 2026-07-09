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
