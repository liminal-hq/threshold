// Android bridge for the native-bus plugin
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

/// Initialises the plugin's mobile-side state.
///
/// Unlike most plugins with an `android_path`, there is no Kotlin `@TauriPlugin`
/// component to register here: `NativeEventBus` and `DurableEventQueue`
/// (`android/src/main/java/ca/liminalhq/threshold/nativebus/`) are plain Kotlin classes
/// meant to be consumed directly -- via a Gradle project dependency -- by the plugins
/// that subscribe to them (alarm-manager, wear-sync, in a later phase), not through the
/// Tauri command/channel bridge. This function exists only so the crate's mobile/desktop
/// split matches the shape of every other plugin in this codebase; it has nothing to
/// initialise yet.
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<NativeBus> {
    Ok(NativeBus)
}

/// Marker state for the native-bus plugin. Carries no plugin handle because this crate
/// registers no Kotlin `@TauriPlugin` component -- see [`init`]. Not generic over
/// `Runtime`: with no handle and no other per-runtime data to hold, there is nothing for
/// a `Runtime` type parameter to parameterise.
pub struct NativeBus;
