// Desktop stub for the native-bus plugin
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

/// Desktop has no native event bus to bridge to -- `NativeEventBus` and `DurableEventQueue` are Android-only substrate for cross-plugin native code. This stub exists only to keep the mobile/desktop split symmetrical with every other plugin in this codebase.
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<NativeBus> {
    Ok(NativeBus)
}

/// Marker state for the native-bus plugin on desktop. Carries no data -- see `mobile::NativeBus` for why this isn't generic over `Runtime` either.
pub struct NativeBus;
