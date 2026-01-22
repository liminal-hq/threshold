import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, useMediaQuery } from '@mui/material';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PlatformUtils } from '../utils/PlatformUtils';
import { SettingsService, Theme as AppTheme } from '../services/SettingsService';
import { themes, generateSystemTheme, ThemeDefinition, MaterialYouResponse } from '../theme/themes';

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
	theme: 'deep-night',
	setTheme: () => {},
	forceDark: false,
	setForceDark: () => {},
	useMaterialYou: false,
	setUseMaterialYou: () => {},
	isDarkMode: false,
});

export const useThemeContext = () => useContext(ThemeContext);

import { useRef } from 'react';

export const ThemeContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [theme, setThemeState] = useState<AppTheme>(SettingsService.getTheme());
	const [forceDark, setForceDarkState] = useState<boolean>(SettingsService.getForceDark());
	const [useMaterialYou, setUseMaterialYouState] = useState<boolean>(
		SettingsService.getUseMaterialYou() ?? false,
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
					const response = await invoke<MaterialYouResponse>(
						'plugin:theme-utils|get_material_you_colours',
					);
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

	// Listen for theme changes from other windows
	useEffect(() => {
		const unlisten = listen<{ theme: AppTheme; forceDark: boolean }>('theme-changed', (event) => {
			console.log('Theme changed event received:', event.payload);
			setThemeState(event.payload.theme);
			setForceDarkState(event.payload.forceDark);
			// We assume useMaterialYou is synced via localstorage or we should add it to the payload
			// For now, let's refresh it from storage
			setUseMaterialYouState(SettingsService.getUseMaterialYou() ?? false);
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

	// 3. Compute Active Theme Definition
	const activeThemeDef: ThemeDefinition = useMemo(() => {
		if (theme === 'system') {
			return generateSystemTheme(isDarkMode, useMaterialYou ? materialYouResponse : undefined);
		}

		const themeGroup = themes[theme] || themes['deep-night'];
		// Fallback to light/dark variant
		return isDarkMode ? (themeGroup as any).dark : (themeGroup as any).light;
	}, [theme, isDarkMode, useMaterialYou, materialYouResponse]);

	// 4. Inject CSS Variables
	useEffect(() => {
		const root = document.documentElement; // Or body

		// Clear previous theme classes (optional, but good for cleanup)
		document.body.className = `theme-${activeThemeDef.id} ${isDarkMode ? 'force-dark' : ''}`;

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
				MuiCard: {
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
