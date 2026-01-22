export const APP_NAME = 'Threshold';
export const DEEP_LINK_SCHEME = 'threshold';

/**
 * Application route paths
 */
export const ROUTES = {
	HOME: '/home',
	RINGING: '/ringing',
	SETTINGS: '/settings',
	EDIT: '/edit',
} as const;

/**
 * Special alarm IDs with specific behaviour
 */
export const SPECIAL_ALARM_IDS = {
	/** Test alarm that navigates back instead of minimizing */
	TEST_ALARM: 999,
} as const;
