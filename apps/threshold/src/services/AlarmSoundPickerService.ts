import { invoke } from '@tauri-apps/api/core';

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

export class AlarmSoundPickerService {
	/**
	 * Opens the Android system alarm sound picker.
	 * Returns a promise that resolves with the selected sound info.
	 * Rejects if the operation is cancelled or fails.
	 */
	async pickAlarmSound(options: PickAlarmSoundOptions = {}): Promise<PickedAlarmSound> {
		try {
			return await invoke<PickedAlarmSound>('plugin:alarm-manager|pick_alarm_sound', {
				options: {
					existingUri: options.existingUri,
					title: options.title,
					showSilent: options.showSilent ?? true,
					showDefault: options.showDefault ?? true,
				},
			});
		} catch (error: any) {
			if (typeof error === 'string' && error.includes('cancelled')) {
				throw new Error('cancelled');
			}
			throw error;
		}
	}
}

export const alarmSoundPickerService = new AlarmSoundPickerService();
