import { emit } from '@tauri-apps/api/event';

export type Theme = 'deep-night' | 'canadian-cottage-winter' | 'georgian-bay-plunge' | 'boring-light' | 'boring-dark';

const KEY_THEME = 'threshold_theme';
const KEY_24H = 'threshold_24h';

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

	// Apply on startup
	applyTheme: () => {
		const theme = SettingsService.getTheme();
		const forceDark = SettingsService.getForceDark();
		document.body.className = `theme-${theme} ${forceDark ? 'force-dark' : ''}`;
	},
};
