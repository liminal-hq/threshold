import { invoke } from '@tauri-apps/api/core';

export interface TimeFormatResponse {
	is24Hour: boolean;
}

export async function getTimeFormat(): Promise<TimeFormatResponse> {
	return await invoke<TimeFormatResponse>('plugin:time-prefs|get_time_format');
}
