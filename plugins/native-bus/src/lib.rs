// Plugin entry point and cross-platform extension trait
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod error;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::NativeBus;
#[cfg(mobile)]
use mobile::NativeBus;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the
/// native-bus plugin state.
pub trait NativeBusExt<R: Runtime> {
    fn native_bus(&self) -> &NativeBus<R>;
}

impl<R: Runtime, T: Manager<R>> NativeBusExt<R> for T {
    fn native_bus(&self) -> &NativeBus<R> {
        self.state::<NativeBus<R>>().inner()
    }
}

/// Initialises the plugin.
///
/// This crate carries no webview-invokable commands today -- its whole purpose is to
/// bring `android/` (the shared `NativeEventBus`/`DurableEventQueue` Kotlin sources) into
/// the generated Gradle project graph, so alarm-manager and wear-sync can depend on it as
/// a Gradle project dependency in a later phase of issue #255. See the workspace
/// `Cargo.toml`'s comment on this crate's direct dependency from the app crate for why
/// that matters even before anything calls `.plugin()` on it in a meaningful way.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-bus")
        .setup(|app, api| {
            #[cfg(mobile)]
            let native_bus = mobile::init(app, api)?;
            #[cfg(desktop)]
            let native_bus = desktop::init(app, api)?;
            app.manage(native_bus);
            Ok(())
        })
        .build()
}
