// Typed TypeScript bindings for the predictive-back plugin's commands and events
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

/**
 * A single frame of the native `OnBackAnimationCallback` lifecycle, emitted as the
 * `predictive-back:event` Tauri event while a swipe-back gesture is in progress.
 */
export interface PredictiveBackEvent {
	type: 'started' | 'progress' | 'cancelled' | 'invoked';
	progress: number;
}

export const PREDICTIVE_BACK_EVENT = 'predictive-back:event';

/**
 * Tells the native side whether there's anywhere in-app for a back gesture to go.
 * When `true`, Android's predictive-back callback is registered and gesture frames start
 * flowing as `predictive-back:event`. When `false`, the callback is unregistered and the
 * system falls through to its own default behaviour (app-minimize / cross-task animation).
 */
export async function setCanGoBack(canGoBack: boolean): Promise<void> {
	// Tauri matches invoke() args by the Rust command's parameter name -- our `set_can_go_back`
	// command takes a `payload: SetCanGoBackRequest`, so the JS args object needs a `payload`
	// key wrapping the struct, not the struct's fields flattened at the top level.
	return await invoke('plugin:predictive-back|set_can_go_back', { payload: { canGoBack } });
}
