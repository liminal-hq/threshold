import { emit } from '@tauri-apps/api/event';
import { TimePrefs } from '../utils/timePrefs';

export type Theme = 'deep-night' | 'canadian-cottage-winter' | 'georgian-bay-plunge' | 'boring-light' | 'boring-dark';

const KEY_THEME = 'threshold_theme';
const KEY_24H = 'threshold_24h';
const KEY_SILENCE_AFTER = 'threshold_silence_after';
const KEY_SNOOZE_LENGTH = 'threshold_snooze_length';

export const SettingsService = {
	getTheme: (): Theme => {
		const theme = localStorage.getItem(KEY_THEME) as string;
		if (theme === 'canadian-cottage') return 'canadian-cottage-winter';
		return (theme as Theme) || 'deep-night';
	},

	setTheme: (theme: Theme) => {
		localStorage.setItem(KEY_THEME, theme);
		SettingsService.applyTheme();
		// Emit event for other windows
		emit('theme-changed', { theme, forceDark: SettingsService.getForceDark() });
	},

	getSystemTimeFormat: async () => {
		return TimePrefs.getSystemTimeFormat();
	},

	getIs24h: (): boolean => {
		return localStorage.getItem(KEY_24H) === 'true';
	},

	setIs24h: (is24h: boolean) => {
		localStorage.setItem(KEY_24H, String(is24h));
	},

	getForceDark: (): boolean => {
		return localStorage.getItem('threshold_force_dark') === 'true';
	},

	setForceDark: (enabled: boolean) => {
		localStorage.setItem('threshold_force_dark', String(enabled));
		SettingsService.applyTheme();
		// Emit event for other windows
		emit('theme-changed', { theme: SettingsService.getTheme(), forceDark: enabled });
	},

	getSilenceAfter: (): number => {
		const val = localStorage.getItem(KEY_SILENCE_AFTER);
		return val ? parseInt(val, 10) : 20; // Default 20 minutes
	},

	setSilenceAfter: (minutes: number) => {
		localStorage.setItem(KEY_SILENCE_AFTER, String(minutes));
	},

	getSnoozeLength: (): number => {
		const val = localStorage.getItem(KEY_SNOOZE_LENGTH);
		return val ? parseInt(val, 10) : 10; // Default 10 minutes
	},

	setSnoozeLength: (minutes: number) => {
		localStorage.setItem(KEY_SNOOZE_LENGTH, String(minutes));
	},

	// Apply on startup
	applyTheme: () => {
		const theme = SettingsService.getTheme();
		const forceDark = SettingsService.getForceDark();
		document.body.className = `theme-${theme} ${forceDark ? 'force-dark' : ''}`;
	},
};
