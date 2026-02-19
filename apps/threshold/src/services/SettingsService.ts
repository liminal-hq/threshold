// Manages user settings state and settings-owned notification actions
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { emit } from '@tauri-apps/api/event';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { TimePrefs } from '../utils/timePrefs';
import { ThemeId } from '../theme/themes';
import { PlatformUtils } from '../utils/PlatformUtils';
import {
	alarmNotificationService,
	type NotificationActionType,
} from './AlarmNotificationService';

export type Theme = ThemeId;

const KEY_THEME = 'threshold_theme';
const KEY_24H = 'threshold_24h';
const KEY_USE_MATERIAL_YOU = 'threshold_use_material_you';
const KEY_FORCE_DARK = 'threshold_force_dark';
const KEY_SILENCE_AFTER = 'threshold_silence_after';
const KEY_SNOOZE_LENGTH = 'threshold_snooze_length';

export const SettingsService = {
	getTheme: (): Theme => {
		const theme = localStorage.getItem(KEY_THEME) as string;
		if (theme === 'canadian-cottage') return 'canadian-cottage-winter';
		return (theme as Theme) || 'system';
	},

	setTheme: (theme: Theme) => {
		localStorage.setItem(KEY_THEME, theme);
		// applyTheme is now handled by ThemeProvider listening to state changes
		// But we emit event for other windows
		emit('settings-changed', { key: 'theme', value: theme });
	},

	getSystemTimeFormat: async () => {
		return TimePrefs.getSystemTimeFormat();
	},

	getUseMaterialYou: (): boolean | undefined => {
		const val = localStorage.getItem(KEY_USE_MATERIAL_YOU);
		if (val === 'true') return true;
		if (val === 'false') return false;
		return true;
	},

	setUseMaterialYou: (enabled: boolean) => {
		localStorage.setItem(KEY_USE_MATERIAL_YOU, String(enabled));
		emit('settings-changed', { key: 'useMaterialYou', value: enabled });
	},

	getIs24h: (): boolean => {
		return localStorage.getItem(KEY_24H) === 'true';
	},

	setIs24h: (is24h: boolean) => {
		localStorage.setItem(KEY_24H, String(is24h));
		emit('settings-changed', { key: 'is24h', value: is24h });
	},

	getForceDark: (): boolean => {
		return localStorage.getItem(KEY_FORCE_DARK) === 'true';
	},

	setForceDark: (enabled: boolean) => {
		localStorage.setItem(KEY_FORCE_DARK, String(enabled));
		// Emit event for other windows
		emit('settings-changed', { key: 'forceDark', value: enabled });
	},

	getSilenceAfter: (): number => {
		const val = localStorage.getItem(KEY_SILENCE_AFTER);
		return val ? parseInt(val, 10) : 20; // Default 20 minutes
	},

	setSilenceAfter: (minutes: number) => {
		localStorage.setItem(KEY_SILENCE_AFTER, String(minutes));
		emit('settings-changed', { key: 'silenceAfter', value: minutes });
	},

	getSnoozeLength: (): number => {
		const val = localStorage.getItem(KEY_SNOOZE_LENGTH);
		return val ? parseInt(val, 10) : 10; // Default 10 minutes
	},

	setSnoozeLength: (minutes: number) => {
		localStorage.setItem(KEY_SNOOZE_LENGTH, String(minutes));
		emit('settings-changed', { key: 'snoozeLength', value: minutes });
	},

	sendTestNotification: async () => {
		const isMobile = PlatformUtils.isMobile();
		try {
			if (isMobile) {
				alarmNotificationService.registerActionTypeProvider(
					'test-trigger-actions',
					(): NotificationActionType[] => [
						{
							id: 'test_trigger',
							actions: [
								{ id: 'test_action_1', title: 'Test Action 1' },
								{ id: 'test_action_2', title: 'Test Action 2' },
							],
						},
					],
				);
			}

			await sendNotification({
				title: 'Test Notification',
				body: 'This is a test notification with actions',
				actionTypeId: isMobile ? 'test_trigger' : undefined,
			});
		} catch (e) {
			console.error('[Settings] Failed to send test notification', e);
		}
	},

	// Deprecated: Logic moved to ThemeProvider
	applyTheme: () => {
		// No-op or legacy fallback if needed
		// The ThemeProvider will read from SettingsService on mount and handle injection.
	},
};
