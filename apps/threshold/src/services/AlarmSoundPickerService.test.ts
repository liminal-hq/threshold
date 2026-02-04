import { describe, it, expect, vi, beforeEach } from 'vitest';
import { alarmSoundPickerService } from './AlarmSoundPickerService';
import { invoke } from '@tauri-apps/api/core';

// Mock the invoke function from @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(),
}));

// Mock PlatformUtils to avoid window not defined error from @tauri-apps/plugin-os
vi.mock('../utils/PlatformUtils', () => ({
	PlatformUtils: {
		isDesktop: vi.fn().mockReturnValue(false),
		isMobile: vi.fn().mockReturnValue(true),
	},
}));

describe('AlarmSoundPickerService', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('should call invoke with correct parameters', async () => {
		const mockResponse = {
			uri: 'content://media/internal/audio/media/123',
			isSilent: false,
			title: 'Argon',
		};

		(invoke as any).mockResolvedValue(mockResponse);

		const options = {
			existingUri: 'content://old',
			title: 'Pick Sound',
		};

		const result = await alarmSoundPickerService.pickAlarmSound(options);

		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|pick_alarm_sound', {
			options: {
				existingUri: 'content://old',
				title: 'Pick Sound',
				showSilent: true,
				showDefault: true,
			},
		});

		expect(result).toEqual(mockResponse);
	});

	it('should throw "cancelled" error when invoke rejects with "cancelled"', async () => {
		(invoke as any).mockRejectedValue('cancelled');

		await expect(alarmSoundPickerService.pickAlarmSound()).rejects.toThrow('cancelled');
	});

	it('should rethrow other errors', async () => {
		const error = new Error('Unknown error');
		(invoke as any).mockRejectedValue(error);

		await expect(alarmSoundPickerService.pickAlarmSound()).rejects.toThrow(error);
	});
});
