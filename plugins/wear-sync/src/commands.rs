// Tauri command handlers exposed to the webview
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use tauri::{command, AppHandle, Runtime};

use crate::error::Result;
use crate::models::{NativeFanOutEnabledResponse, SetNativeFanOutEnabledRequest};
use crate::WearSyncExt;

/// Enable or disable wear-sync's native (in-process) fired→watch-ring fan-out -- a
/// developer-only toggle (issue #255 Phase 3B) for exercising the Rust `alarm:fired` →
/// `send_alarm_ring` path in isolation. No-ops on desktop, which has no native fan-out
/// concept in the first place.
#[command]
pub(crate) async fn set_native_fan_out_enabled<R: Runtime>(
    app: AppHandle<R>,
    request: SetNativeFanOutEnabledRequest,
) -> Result<()> {
    app.wear_sync().set_native_fan_out_enabled(request.enabled)
}

/// Reads the current value of the native fan-out developer toggle. Defaults to `true`
/// (native fan-out enabled) when nothing has been persisted yet.
#[command]
pub(crate) async fn get_native_fan_out_enabled<R: Runtime>(
    app: AppHandle<R>,
) -> Result<NativeFanOutEnabledResponse> {
    app.wear_sync().get_native_fan_out_enabled()
}
