// App-wide constant values
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

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
