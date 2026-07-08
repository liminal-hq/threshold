// Typed TypeScript bindings for the time-prefs plugin's commands
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

export interface TimeFormatResponse {
	is24Hour: boolean;
}

export async function getTimeFormat(): Promise<TimeFormatResponse> {
	return await invoke<TimeFormatResponse>('plugin:time-prefs|get_time_format');
}
