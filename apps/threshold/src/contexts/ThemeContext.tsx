// React context managing theme selection and Material You colours
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, useMediaQuery } from '@mui/material';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getMaterialYouColours } from 'tauri-plugin-theme-utils-api';
import { PlatformUtils } from '../utils/PlatformUtils';
import { SettingsService, Theme as AppTheme } from '../services/SettingsService';
import { themes, generateSystemTheme, ThemeDefinition, MaterialYouResponse } from '../theme/themes';
import { computeWidgetTheme } from '../theme/widgetTheme';

interface ThemeContextType {
	theme: AppTheme;
	setTheme: (theme: AppTheme) => void;
	forceDark: boolean;
	setForceDark: (enabled: boolean) => void;
	useMaterialYou: boolean;
	setUseMaterialYou: (enabled: boolean) => void;
	isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
	theme: 'system',
	setTheme: () => {},
	forceDark: false,
	setForceDark: () => {},
	useMaterialYou: true,
	setUseMaterialYou: () => {},
	isDarkMode: false,
});

export const useThemeContext = () => useContext(ThemeContext);

import { useRef } from 'react';

export const ThemeContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [theme, setThemeState] = useState<AppTheme>(SettingsService.getTheme());
	const [forceDark, setForceDarkState] = useState<boolean>(SettingsService.getForceDark());
	const [useMaterialYou, setUseMaterialYouState] = useState<boolean>(
		SettingsService.getUseMaterialYou() ?? true,
	);
	const [materialYouResponse, setMaterialYouResponse] = useState<MaterialYouResponse | undefined>(
		undefined,
	);

	// Track injected keys to clean up on theme switch
	const lastInjectedKeys = useRef<string[]>([]);

	const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');

	// 1. Fetch Material You Colours on Mount (if Android)
	useEffect(() => {
		const fetchColours = async () => {
			if (PlatformUtils.isMobile() && PlatformUtils.getPlatform() === 'android') {
				try {
					console.log('Fetching Material You Colours...');
					const response = await getMaterialYouColours();
					console.log('Material You Response:', response);
					setMaterialYouResponse(response);

					// Enable by default if supported and not explicitly set
					if (SettingsService.getUseMaterialYou() === undefined) {
						console.log('Material You supported and not configured. Enabling by default.');
						setUseMaterialYouState(true);
						SettingsService.setUseMaterialYou(true);
					}
				} catch (e) {
					console.error('Failed to fetch Material You colours:', e);
				}
			}
		};
		fetchColours();
	}, []);

	// Listen for theme/settings changes from other windows
	useEffect(() => {
		const unlisten = listen<{ key: string; value: any }>('settings-changed', (event) => {
			console.log('ThemeContext received settings update:', event.payload);
			const { key, value } = event.payload;

			switch (key) {
				case 'theme':
					setThemeState(value as AppTheme);
					break;
				case 'forceDark':
					setForceDarkState(Boolean(value));
					break;
				case 'useMaterialYou':
					setUseMaterialYouState(Boolean(value));
					break;
			}
		});

		return () => {
			unlisten.then((f) => f());
		};
	}, []);

	// 2. Determine Dark Mode
	const isDarkMode = useMemo(() => {
		if (theme === 'boring-light') return false;
		if (theme === 'boring-dark') return true;
		if (forceDark) return true;
		return systemPrefersDark;
	}, [forceDark, theme, systemPrefersDark]);

	// 3. Compute both light and dark variants of the active theme -- the widget palette needs
	// both regardless of which mode the webview itself is currently rendering, and computing
	// them together here means activeThemeDef below can just pick one instead of the two code
	// paths (static lookup vs generateSystemTheme) drifting out of sync with each other.
	const themeVariants = useMemo((): { light: ThemeDefinition; dark: ThemeDefinition } => {
		if (theme === 'system') {
			const materialYou = useMaterialYou ? materialYouResponse : undefined;
			return {
				light: generateSystemTheme(false, materialYou),
				dark: generateSystemTheme(true, materialYou),
			};
		}

		const themeGroup = themes[theme] || themes['deep-night'];
		return { light: (themeGroup as any).light, dark: (themeGroup as any).dark };
	}, [theme, useMaterialYou, materialYouResponse]);

	// 3b. Compute Active Theme Definition
	const activeThemeDef: ThemeDefinition = useMemo(
		() => (isDarkMode ? themeVariants.dark : themeVariants.light),
		[themeVariants, isDarkMode],
	);

	// 3c. Push the widget colour palette (both modes) to Rust on every theme application --
	// initial load, user selection, and Material You refresh all flow through themeVariants
	// changing. Fire-and-forget: a failed push (e.g. desktop dev, where the widget plugin isn't
	// relevant) must never break theme application itself.
	useEffect(() => {
		const palettes = computeWidgetTheme(themeVariants.light, themeVariants.dark);
		invoke('set_widget_theme', { theme: palettes }).catch((error) => {
			console.warn('[ThemeContext] Failed to push widget theme to Rust:', error);
		});
	}, [themeVariants]);

	// 4. Inject CSS Variables
	useEffect(() => {
		const root = document.documentElement; // Or body

		// Clear previous theme classes (optional, but good for cleanup)
		document.body.className = `theme-${activeThemeDef.id} ${isDarkMode ? 'dark-mode' : ''} ${forceDark ? 'force-dark-mode' : ''}`;

		// Cleanup stale variables from previous injection
		lastInjectedKeys.current.forEach((key) => {
			root.style.removeProperty(key);
		});

		// Inject new variables and track keys
		const newKeys: string[] = [];
		Object.entries(activeThemeDef.variables).forEach(([key, value]) => {
			root.style.setProperty(key, value);
			newKeys.push(key);
		});

		lastInjectedKeys.current = newKeys;
	}, [activeThemeDef, isDarkMode]);

	// 5. Create MUI Theme
	const muiTheme = useMemo(() => {
		return createTheme({
			palette: {
				mode: isDarkMode ? 'dark' : 'light',
				...activeThemeDef.muiPalette,
			},
			components: {
				// MUI's dark-mode palette applies an automatic elevation overlay to every Paper-
				// based surface -- a white-gradient backgroundImage, scaled by elevation -- which
				// lightens it well beyond the theme's declared background.paper/background.default.
				// This used to be scoped to just MuiCard, but Card is only one of many Paper-based
				// surfaces (Dialog, Popover, Menu, MUI X's picker dialogs all render through the
				// same mechanism, at a *higher* elevation than Card's default). Scoping this to
				// Paper itself is what makes background.paper actually mean what the theme
				// declares everywhere, not just on cards -- see issue #290, where an unpinned
				// Dialog surface silently broke a contrast pairing that was only ever validated
				// against the theme's nominal (not actually-rendered) background colour. Card
				// renders as a Paper internally, so this covers it too without a separate override.
				MuiPaper: {
					styleOverrides: {
						root: {
							backgroundImage: 'none',
						},
					},
				},
			},
		});
	}, [activeThemeDef, isDarkMode]);

	// State Setters wrappers
	const setTheme = (newTheme: AppTheme) => {
		setThemeState(newTheme);
		SettingsService.setTheme(newTheme);
	};

	const setForceDark = (enabled: boolean) => {
		setForceDarkState(enabled);
		SettingsService.setForceDark(enabled);
	};

	const setUseMaterialYou = (enabled: boolean) => {
		setUseMaterialYouState(enabled);
		SettingsService.setUseMaterialYou(enabled);
	};

	return (
		<ThemeContext.Provider
			value={{
				theme,
				setTheme,
				forceDark,
				setForceDark,
				useMaterialYou,
				setUseMaterialYou,
				isDarkMode,
			}}
		>
			<MuiThemeProvider theme={muiTheme}>
				<CssBaseline />
				{children}
			</MuiThemeProvider>
		</ThemeContext.Provider>
	);
};
