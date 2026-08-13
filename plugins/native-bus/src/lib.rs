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

/// Extensions to [`tauri::App`] and [`tauri::AppHandle`] to access the native-bus plugin
/// state.
///
/// `NativeBus` itself is not generic over `Runtime`, unlike every other plugin's state in
/// this codebase: those hold a `PluginHandle<R>` (or similar per-runtime data) that a
/// registered Kotlin `@TauriPlugin` component needs, and `NativeBus` registers no such
/// component and carries no data at all. This trait is still implemented per concrete
/// manager type (rather than as a single blanket `impl<R: Runtime, T: Manager<R>>`, the
/// way every other plugin's extension trait in this codebase does it) because a blanket
/// impl needs its own `Runtime` parameter to appear in the trait itself to satisfy
/// coherence -- which a *non-generic* trait like this one can't provide.
pub trait NativeBusExt {
    fn native_bus(&self) -> &NativeBus;
}

impl<R: Runtime> NativeBusExt for tauri::App<R> {
    fn native_bus(&self) -> &NativeBus {
        self.state::<NativeBus>().inner()
    }
}

impl<R: Runtime> NativeBusExt for tauri::AppHandle<R> {
    fn native_bus(&self) -> &NativeBus {
        self.state::<NativeBus>().inner()
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
