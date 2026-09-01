// Typed TypeScript bindings for the wear-sync plugin's webview-invokable commands
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

export interface NativeFanOutEnabledResponse {
	enabled: boolean;
}

/**
 * Reads the "native watch fan-out" developer toggle (issue #255 Phase 3B). Defaults to
 * `true` (enabled) when nothing has been persisted yet. Android-only in practice -- always
 * reports `true` on desktop, which has no native fan-out to disable.
 */
export async function getNativeFanOutEnabled(): Promise<NativeFanOutEnabledResponse> {
	return await invoke<NativeFanOutEnabledResponse>('plugin:wear-sync|get_native_fan_out_enabled');
}

/**
 * Enables or disables wear-sync's native (in-process, pre-Rust-boot) fired→watch-ring
 * fan-out, so the older Rust `alarm:fired` → `send_alarm_ring` path can be exercised in
 * isolation for testing. No-ops on desktop.
 */
export async function setNativeFanOutEnabled(enabled: boolean): Promise<void> {
	await invoke('plugin:wear-sync|set_native_fan_out_enabled', { request: { enabled } });
}
