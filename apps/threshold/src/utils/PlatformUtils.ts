// Platform detection helpers (mobile/desktop/OS)
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { platform } from '@tauri-apps/plugin-os';

export const PlatformUtils = {
	/**
	 * Returns true if the current platform is mobile (iOS or Android).
	 */
	isMobile: (): boolean => {
		const os = platform();
		return os === 'ios' || os === 'android';
	},

	/**
	 * Returns true if the current platform is desktop.
	 */
	isDesktop: (): boolean => {
		return !PlatformUtils.isMobile();
	},

	/**
	 * Returns the name of the current platform.
	 */
	getPlatform: (): string => {
		return platform();
	},
};
