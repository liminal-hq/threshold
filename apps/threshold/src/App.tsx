// Root application component with routing, theming, and platform initialisation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { ThemeContextProvider } from './contexts/ThemeContext';
import { AlarmsProvider } from './contexts/AlarmsContext';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
// import { LogicalSize } from '@tauri-apps/api/dpi';
import { platform } from '@tauri-apps/plugin-os';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

/* Theme variables */
// import './theme/variables.css'; // Deprecated in favor of Code-First ThemeProvider
import './theme/ringing.css';
import './theme/components.css';
import './theme/transitions.css';
import { routeTransitions } from './utils/RouteTransitions';
import { SettingsService } from './services/SettingsService';
import { alarmManagerService } from './services/AlarmManagerService';
import { ROUTES } from './constants';

const App: React.FC = () => {
	console.log('📦 [threshold] App rendering, pathname:', window.location.pathname);

	useEffect(() => {
		console.log('🚀 [threshold] App useEffect running');
		// Detect platform (synchronous in Tauri v2)
		const os = platform();
		const win = getCurrentWindow();

		const initSettingsAndPipelines = async () => {
			let is24Hour = SettingsService.getIs24h();

			try {
				const detected = await SettingsService.getSystemTimeFormat();
				is24Hour = detected.is24Hour;
				console.log(`[App] System time format: ${is24Hour ? '24h' : '12h'} (source: ${detected.source})`);
			} catch (e) {
				console.error('[App] Failed to get system time format:', e);
			}

			SettingsService.setIs24h(is24Hour);

			try {
				await invoke('set_time_format', { is24_hour: is24Hour });
			} catch (e) {
				console.warn('[App] Failed to sync initial time format:', e);
			}

			try {
				await invoke('set_snooze_length', { minutes: SettingsService.getSnoozeLength() });
			} catch (e) {
				console.warn('[App] Failed to sync initial snooze length:', e);
			}

			try {
				await invoke('mark_alarm_pipeline_ready');
			} catch (e) {
				console.warn('[App] Failed to mark alarm pipeline ready:', e);
			}
		};

		const initAlarmService = async () => {
			try {
				alarmManagerService.setRouter(router);
				await alarmManagerService.init();
			} catch (e) {
				console.error('[App] Failed to init AlarmManagerService:', e);
			}
		};
		void initSettingsAndPipelines();
		void initAlarmService();

		const showWindow = async () => {
			if (os === 'android' || os === 'ios') return;
			try {
				try {
					await win.setDecorations(false); // Force removal of native title bar
					// await win.setSize(new LogicalSize(450, 800));
					await win.center();
				} catch (e) {
					console.error('Failed to resize/decorate window:', e);
				}

				const visible = await win.isVisible();
				if (!visible) {
					await win.show();
					await win.setFocus();
				}
			} catch (error: any) {
				console.warn('Failed to show/focus window:', error);
			}
		};
		showWindow();

		// Request notification permission on Android (required for alarm notifications)
		const requestNotificationPermission = async () => {
			if (os === 'android') {
				try {
					// Use static import
					let permissionGranted = await isPermissionGranted();

					if (!permissionGranted) {
						console.log('[App] Requesting notification permission...');
						const permission = await requestPermission();
						permissionGranted = permission === 'granted';
						console.log('[App] Notification permission:', permissionGranted ? 'granted' : 'denied');
					} else {
						console.log('[App] Notification permission already granted');
					}
				} catch (e) {
					console.error('[App] Failed to request notification permission:', e);
				}
			}
		};
		requestNotificationPermission();

		// Initialize deep link handling
		import('./services/DeepLinkService').then(({ initDeepLinks }) => {
			initDeepLinks(router).catch((e) => {
				console.error('Failed to initialize deep links:', e);
			});
		});

		// Handle Back Button on Android
		// TODO: When upgrading to Tauri 2.9.0+, switch to official @tauri-apps/api/app:
		// const { onBackButtonPress } = await import('@tauri-apps/api/app');
		// const unlisten = await onBackButtonPress(() => { /* same logic */ return false; });
		const initBackButton = async () => {
			if (os === 'android') {
				try {
					// Use community plugin (tauri-plugin-app-events) instead of @tauri-apps/api/app
					const { onBackKeyDown } = await import('tauri-plugin-app-events-api');

					onBackKeyDown(() => {
						// Disable back button on Ringing screen
						const currentPath = router.state.location.pathname;
						if (currentPath.startsWith(ROUTES.RINGING)) {
							return false; // Prevent default (do nothing)
						}

						// Check if we can go back.
						// window.history.length > 1 is the standard browser way to check history depth.
						if (window.history.length > 1) {
							// Signal that this is a backward navigation
							routeTransitions.setNextDirection('backwards');
							router.history.back();
						} else {
							// If we can't go back, minimize the app (standard Android behaviour)
							win.minimize();
						}
						return false; // Prevent default
					});
				} catch (e) {
					console.error('Failed to initialize back button listener', e);
				}
			}
		};
		initBackButton();
	}, []);

	return (
		<ThemeContextProvider>
			<AlarmsProvider>
				<LocalizationProvider dateAdapter={AdapterDateFns}>
					<RouterProvider router={router} />
				</LocalizationProvider>
			</AlarmsProvider>
		</ThemeContextProvider>
	);
};

export default App;
