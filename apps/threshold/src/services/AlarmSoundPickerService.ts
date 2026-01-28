import { invoke } from '@tauri-apps/api/core';
import { PlatformUtils } from '../utils/PlatformUtils';
import { open } from '@tauri-apps/plugin-dialog';

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
		if (PlatformUtils.isDesktop()) {
			try {
				const selected = await open({
					multiple: false,
					title: options.title || 'Select Alarm Sound',
					filters: [{
						name: 'Audio',
						extensions: ['mp3', 'wav', 'ogg', 'flac']
					}]
				});

				if (!selected) {
					throw new Error('cancelled');
				}

				// On desktop, the URI is just the absolute path
				const path = Array.isArray(selected) ? selected[0] : selected;
				// Extract file name for the title
				const title = path.split(/[\/\\]/).pop() || 'Selected Sound';

				return {
					uri: path,
					isSilent: false,
					title
				};
			} catch (error) {
				throw error;
			}
		}

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
