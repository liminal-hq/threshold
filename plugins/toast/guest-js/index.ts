// Typed TypeScript bindings for the toast plugin's commands
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

export type ToastDuration = 'short' | 'long';
export type ToastPosition = 'top' | 'centre' | 'bottom';

export interface ShowToastOptions {
	message: string;
	duration?: ToastDuration;
	position?: ToastPosition;
}

export async function showToast(options: ShowToastOptions): Promise<void> {
	await invoke('plugin:toast|show', {
		payload: {
			message: options.message,
			duration: options.duration ?? 'short',
			position: options.position ?? 'bottom',
		},
	});
}
