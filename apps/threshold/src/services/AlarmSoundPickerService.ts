import {
	pickAlarmSound as pickAlarmSoundNative,
	type PickAlarmSoundOptions,
	type PickedAlarmSound,
} from 'tauri-plugin-alarm-manager-api';
import { PlatformUtils } from '../utils/PlatformUtils';
import { open } from '@tauri-apps/plugin-dialog';

export type { PickAlarmSoundOptions, PickedAlarmSound };

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
			return await pickAlarmSoundNative({
				existingUri: options.existingUri,
				title: options.title,
				showSilent: options.showSilent ?? true,
				showDefault: options.showDefault ?? true,
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
