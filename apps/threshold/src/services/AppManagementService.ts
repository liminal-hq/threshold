// Minimises the app to the background
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { minimizeApp as minimizeAppNative } from 'tauri-plugin-app-management-api';

class AppManagementService {
	/**
	 * Minimizes the application to the background.
	 * On Android, this uses moveTaskToBack(true).
	 * On iOS, this is currently a no-op.
	 */
	async minimizeApp(): Promise<void> {
		try {
			await minimizeAppNative();
		} catch (error) {
			console.error('Failed to minimize app:', error);
		}
	}
}

export const appManagementService = new AppManagementService();
