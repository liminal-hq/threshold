// Handles deep-link URL routing to in-app screens
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import type { router as routerType } from '../router';
import { DEEP_LINK_SCHEME } from '../constants';

let initialized = false;
let routerInstance: typeof routerType | null = null;

/**
 * Initialize deep link handling for the application.
 * Handles both cold-start deep links (app launched via deep link)
 * and runtime deep links (app already running).
 *
 * @param router - The TanStack Router instance
 */
export async function initDeepLinks(router: typeof routerType) {
	if (initialized) {
		console.log('Deep links already initialized');
		return;
	}

	initialized = true;
	routerInstance = router;

	console.log('Initializing deep link handlers...');

	// Handle cold-start deep link (app launched via deep link)
	try {
		const urls = await getCurrent();
		if (urls && urls.length > 0) {
			console.log('Cold-start deep link detected:', urls[0]);
			handleDeepLink(urls[0]);
		}
	} catch (e) {
		// No cold-start deep link, this is normal
		console.log('No cold-start deep link');
	}

	// Handle runtime deep links (app already running)
	try {
		await onOpenUrl((urls) => {
			if (urls && urls.length > 0) {
				console.log('Runtime deep link received:', urls[0]);
				handleDeepLink(urls[0]);
			}
		});
		console.log('Deep link listener registered');
	} catch (e) {
		console.error('Failed to register deep link listener:', e);
	}

	// Fallback for when the ringing notification's full-screen intent never fires (e.g. the
	// USE_FULL_SCREEN_INTENT special permission is off on Android 14+) or the app is simply
	// reopened from the home-screen icon while an alarm is still ringing -- neither case
	// delivers a deep link, so there'd otherwise be no way back to the ringing screen short of
	// tapping the notification itself. Harmless no-op if a deep link already navigated here.
	await checkForActiveRingingAlarm();
}

/**
 * Routes to the ringing screen if a native alarm is currently ringing and we're not already
 * there. Called once at startup and again on every window focus regain (see App.tsx), since a
 * missed full-screen-intent launch can be discovered either at cold start or on resume.
 */
export async function checkForActiveRingingAlarm() {
	if (!routerInstance) return;

	try {
		const { getCurrentlyRingingAlarm } = await import('tauri-plugin-alarm-manager-api');
		const id = await getCurrentlyRingingAlarm();
		if (id == null) return;

		const target = `/ringing/${id}`;
		if (routerInstance.state.location.pathname === target) return;

		console.log('[DeepLink] Routing to active ringing alarm as a fallback:', target);
		routerInstance.navigate({ to: target as any });
	} catch (e) {
		console.error('[DeepLink] Failed to check for an active ringing alarm:', e);
	}
}

/**
 * Parse and handle a deep link URL.
 * Converts ${DEEP_LINK_SCHEME}:// URLs to internal routes.
 *
 * Examples:
 * - ${DEEP_LINK_SCHEME}://home → /home
 * - ${DEEP_LINK_SCHEME}://ringing/123 → /ringing/123
 * - ${DEEP_LINK_SCHEME}://settings → /settings
 */
function handleDeepLink(url: string) {
	try {
		const parsed = new URL(url);

		// Optional: Validate scheme
		if (parsed.protocol !== `${DEEP_LINK_SCHEME}:`) {
			console.warn(
				`[DeepLink] Unknown protocol: ${parsed.protocol}, expected ${DEEP_LINK_SCHEME}:`,
			);
			// We might still try to handle it if it's just a path, but usually strict is better
		}

		// Extract path from deep link
		// For ${DEEP_LINK_SCHEME}://ringing/123, pathname will be empty and host is 'ringing'
		// We need to reconstruct the path
		let path = parsed.pathname || '/';

		// Handle the case where the route is in the host (e.g., ${DEEP_LINK_SCHEME}://home)
		if (parsed.host && parsed.host !== 'localhost') {
			path = '/' + parsed.host + path;
		}

		// Normalize path
		if (!path.startsWith('/')) {
			path = '/' + path;
		}

		console.log('Deep link parsed:', { url, path });
		if (path.startsWith('/ringing/')) {
			console.log('[DeepLink] Ringing route detected:', path);
		}

		// Navigate using router
		if (routerInstance) {
			routerInstance.navigate({ to: path as any });
		} else {
			console.error('Router not available for deep link navigation');
		}
	} catch (e) {
		console.error('Failed to parse deep link:', url, e);
	}
}
