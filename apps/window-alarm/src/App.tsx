import React, { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { ThemeContextProvider } from './contexts/ThemeContext';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { platform } from '@tauri-apps/plugin-os';

/* Theme variables */
import './theme/variables.css';
import './theme/ringing.css';
import './theme/components.css';

const App: React.FC = () => {
	console.log('🚀 [window-alarm] App component rendering');

	useEffect(() => {
		// Detect platform (synchronous in Tauri v2)
		const os = platform();
		const win = getCurrentWindow();

		const showWindow = async () => {
			try {
				// Force Desktop Window Size 
				if (os !== 'android' && os !== 'ios') {
					try {
						await win.setDecorations(false); // Force removal of native title bar
						await win.unmaximize();
						await win.setSize(new LogicalSize(450, 800));
						await win.center();
					} catch (e) {
						console.error('Failed to resize/decorate window:', e);
					}
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

		// Initialize deep link handling
		import('./services/DeepLinkService').then(({ initDeepLinks }) => {
			initDeepLinks(router).catch((e) => {
				console.error('Failed to initialize deep links:', e);
			});
		});

		// Handle Back Button on Android
		const initBackButton = async () => {
			if (os === 'android') {
				try {
					// Dynamic import to be safe, though @tauri-apps/api/app is isomorphic safe usually
					const { onBackButtonPress } = await import('@tauri-apps/api/app');

					await onBackButtonPress(() => {
						// Check if we can go back.
						// window.history.length > 1 is the standard browser way to check history depth.
						if (window.history.length > 1) {
							router.history.back();
						} else {
							// If we can't go back, minimize the app (standard Android behavior)
							win.minimize();
						}
					});
				} catch (e) {
					console.error('Failed to initialize back button listener', e);
				}
			}
		};
		initBackButton();

		// Cleanup is handled by Tauri's plugin system generally, or we just let it persist for the app life.
		// onBackButtonPress returns a Promise<Subject/Unlisten function> if we want to unlisten, 
		// but since this is the root App component, we usually keep it.

	}, []);

	return (
		<ThemeContextProvider>
			<LocalizationProvider dateAdapter={AdapterDateFns}>
				<RouterProvider router={router} />
			</LocalizationProvider>
		</ThemeContextProvider>
	);
};

export default App;
