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
		// If router can go back, prevent close and go back.
		// Otherwise, allow close (minimize app).
		const unlistenPromise = win.onCloseRequested(async (event) => {
			// Check if we can go back in history.
			// Note: window.history.length isn't perfect but typical proxy in SPAs.
			// TanStack router doesn't expose a simple "canGoBack" boolean easily on the router instance without hook context,
			// but we can try just going back and if it's the root, it might exit.
			// However, usually window.history.length > 1 implies we can go back.
			if (window.history.length > 1) {
				event.preventDefault();
				router.history.back();
			}
		});

		return () => {
			unlistenPromise.then(unlisten => unlisten());
		};
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
