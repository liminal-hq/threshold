import { invoke } from '@tauri-apps/api/core';

/**
 * Minimises the application to the background.
 * On Android, this uses moveTaskToBack(true). On iOS, this is currently a no-op.
 */
export async function minimizeApp(): Promise<void> {
	await invoke('plugin:app-management|minimize_app');
}
