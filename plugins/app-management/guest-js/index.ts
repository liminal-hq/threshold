// Typed TypeScript bindings for the app-management plugin's commands
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

/**
 * Minimises the application to the background.
 * On Android, this uses moveTaskToBack(true). On iOS, this is currently a no-op.
 */
export async function minimizeApp(): Promise<void> {
	await invoke('plugin:app-management|minimize_app');
}
