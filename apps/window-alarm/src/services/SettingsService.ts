export type Theme = 'deep-night' | 'canadian-cottage' | 'georgian-bay-plunge' | 'boring-light' | 'boring-dark';

const KEY_THEME = 'window_alarm_theme';
const KEY_24H = 'window_alarm_24h';

export const SettingsService = {
	getTheme: (): Theme => {
		return (localStorage.getItem(KEY_THEME) as Theme) || 'deep-night';
	},

	setTheme: (theme: Theme) => {
		localStorage.setItem(KEY_THEME, theme);
		SettingsService.applyTheme();
	},

	getIs24h: (): boolean => {
		return localStorage.getItem(KEY_24H) === 'true';
	},

	setIs24h: (is24h: boolean) => {
		localStorage.setItem(KEY_24H, String(is24h));
	},

	getForceDark: (): boolean => {
		return localStorage.getItem('window_alarm_force_dark') === 'true';
	},

	setForceDark: (enabled: boolean) => {
		localStorage.setItem('window_alarm_force_dark', String(enabled));
		SettingsService.applyTheme();
	},

	// Apply on startup
	applyTheme: () => {
		const theme = SettingsService.getTheme();
		const forceDark = SettingsService.getForceDark();
		document.body.className = `theme-${theme} ${forceDark ? 'force-dark' : ''}`;
	},
};
