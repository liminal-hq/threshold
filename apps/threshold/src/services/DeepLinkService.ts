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
            console.warn(`[DeepLink] Unknown protocol: ${parsed.protocol}, expected ${DEEP_LINK_SCHEME}:`);
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
