import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';

export type Theme = 'deep-night' | 'canadian-cottage' | 'georgian-bay-plunge' | 'boring-light' | 'boring-dark' | 'system';

const KEY_THEME = 'window_alarm_theme';
const KEY_24H = 'window_alarm_24h';
const KEY_USE_MATERIAL_YOU = 'window_alarm_use_material_you';

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

	getUseMaterialYou: (): boolean => {
		return localStorage.getItem(KEY_USE_MATERIAL_YOU) === 'true';
	},

	setUseMaterialYou: (enabled: boolean) => {
		localStorage.setItem(KEY_USE_MATERIAL_YOU, String(enabled));
		SettingsService.applyTheme();
	},

	// Apply on startup
	applyTheme: async () => {
		const theme = SettingsService.getTheme();
		const forceDark = SettingsService.getForceDark();
		const useMaterialYou = SettingsService.getUseMaterialYou();
		const os = platform();

		let activeTheme = theme;
		if (theme === 'system') {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			activeTheme = prefersDark ? 'boring-dark' : 'boring-light';
		}

		document.body.className = `theme-${activeTheme} ${forceDark ? 'force-dark' : ''}`;

		// Reset inline styles first
		document.body.style.removeProperty('--ion-color-primary');
		document.body.style.removeProperty('--ion-color-primary-rgb');
		document.body.style.removeProperty('--ion-color-primary-contrast');
		document.body.style.removeProperty('--ion-color-primary-contrast-rgb');
		document.body.style.removeProperty('--ion-color-primary-shade');
		document.body.style.removeProperty('--ion-color-primary-tint');
		document.body.style.removeProperty('--ion-color-secondary');
		document.body.style.removeProperty('--ion-color-secondary-rgb');
		document.body.style.removeProperty('--ion-color-secondary-contrast');
		document.body.style.removeProperty('--ion-color-secondary-contrast-rgb');
		document.body.style.removeProperty('--ion-color-secondary-shade');
		document.body.style.removeProperty('--ion-color-secondary-tint');
		document.body.style.removeProperty('--ion-background-color');
		document.body.style.removeProperty('--ion-text-color');

		if (theme === 'system' && useMaterialYou && os === 'android') {
			try {
				const response: any = await invoke('plugin:theme-utils|get_material_you_colours');
				if (response && response.colours) {
					const c = response.colours;
					// Map Material You colours to Ionic variables

					// Primary -> System Accent 1
					// Using 600 for primary, standard mapping
					const primary = c.system_accent1_600;
					document.body.style.setProperty('--ion-color-primary', primary);
					// RGB conversion would be needed for --ion-color-primary-rgb if we want full fidelity,
					// but Ionic can often work without it if we don't use the alpha variants heavily,
					// or we can implement a hexToRgb utility. For now, setting the main color.

					// Background -> System Neutral 1
					// Light mode: neutral1_50 (almost white) or 10. Dark mode: neutral1_900.
					const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

					if (prefersDark || forceDark) {
						document.body.style.setProperty('--ion-background-color', c.system_neutral1_900);
						document.body.style.setProperty('--ion-text-color', c.system_neutral1_100);
					} else {
						document.body.style.setProperty('--ion-background-color', c.system_neutral1_50);
						document.body.style.setProperty('--ion-text-color', c.system_neutral1_900);
					}

					// Secondary -> System Accent 3
					document.body.style.setProperty('--ion-color-secondary', c.system_accent3_600);
				}
			} catch (e) {
				console.error('Failed to get Material You colours:', e);
			}
		}
	},
};

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
	SettingsService.applyTheme();
});
