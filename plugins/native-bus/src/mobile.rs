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
) -> crate::Result<NativeBus<R>> {
    Ok(NativeBus(std::marker::PhantomData))
}

/// Marker state for the native-bus plugin. Carries no plugin handle because this crate
/// registers no Kotlin `@TauriPlugin` component -- see [`init`].
///
/// Phantom over `fn() -> R` rather than bare `R`: `app.manage()` requires the state type
/// to be `Send + Sync`, and a plain `PhantomData<R>` only satisfies that when `R` itself
/// does, which `Runtime` does not guarantee. A function pointer is always `Send + Sync`
/// regardless of `R`, so phantom-typing over one sidesteps the requirement entirely.
pub struct NativeBus<R: Runtime>(std::marker::PhantomData<fn() -> R>);
