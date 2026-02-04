import { invoke } from '@tauri-apps/api/core';

class AppManagementService {
	/**
	 * Minimizes the application to the background.
	 * On Android, this uses moveTaskToBack(true).
	 * On iOS, this is currently a no-op.
	 */
	async minimizeApp(): Promise<void> {
		try {
			await invoke('plugin:app-management|minimize_app');
		} catch (error) {
			console.error('Failed to minimize app:', error);
		}
	}
}

export const appManagementService = new AppManagementService();
