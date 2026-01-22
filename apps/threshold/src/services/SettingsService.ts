import { emit } from '@tauri-apps/api/event';
import { TimePrefs } from '../utils/timePrefs';
import { ThemeId } from '../theme/themes';

export type Theme = ThemeId;

const KEY_THEME = 'threshold_theme';
const KEY_24H = 'threshold_24h';
const KEY_USE_MATERIAL_YOU = 'threshold_use_material_you';
const KEY_FORCE_DARK = 'threshold_force_dark';

export const SettingsService = {
	getTheme: (): Theme => {
		const theme = localStorage.getItem(KEY_THEME) as string;
		if (theme === 'canadian-cottage') return 'canadian-cottage-winter';
		return (theme as Theme) || 'deep-night';
	},

	setTheme: (theme: Theme) => {
		localStorage.setItem(KEY_THEME, theme);
		// applyTheme is now handled by ThemeProvider listening to state changes
		// But we emit event for other windows
		emit('theme-changed', { theme, forceDark: SettingsService.getForceDark() });
	},

	getSystemTimeFormat: async () => {
		return TimePrefs.getSystemTimeFormat();
	},

	getUseMaterialYou: (): boolean | undefined => {
		const val = localStorage.getItem(KEY_USE_MATERIAL_YOU);
		if (val === 'true') return true;
		if (val === 'false') return false;
		return undefined;
	},

	setUseMaterialYou: (enabled: boolean) => {
		localStorage.setItem(KEY_USE_MATERIAL_YOU, String(enabled));
		emit('theme-changed', {
			theme: SettingsService.getTheme(),
			forceDark: SettingsService.getForceDark(),
		});
	},

	getIs24h: (): boolean => {
		return localStorage.getItem(KEY_24H) === 'true';
	},

	setIs24h: (is24h: boolean) => {
		localStorage.setItem(KEY_24H, String(is24h));
	},

	getForceDark: (): boolean => {
		return localStorage.getItem(KEY_FORCE_DARK) === 'true';
	},

	setForceDark: (enabled: boolean) => {
		localStorage.setItem(KEY_FORCE_DARK, String(enabled));
		// Emit event for other windows
		emit('theme-changed', { theme: SettingsService.getTheme(), forceDark: enabled });
	},

	// Deprecated: Logic moved to ThemeProvider
	applyTheme: () => {
		// No-op or legacy fallback if needed
		// The ThemeProvider will read from SettingsService on mount and handle injection.
	},
};
