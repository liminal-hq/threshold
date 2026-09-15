// Plugin entry point
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

/// Initialises the plugin.
///
/// This crate carries no webview-invokable commands and no Rust-side state -- unlike
/// native-bus, its whole purpose (the shared `NativeEventLog` Kotlin class) is used
/// entirely from Kotlin, with nothing for Rust to call. Its only job is bringing
/// `android/` into the generated Gradle project graph so alarm-manager, wear-sync,
/// app-management, and native-bus can each depend on it as a Gradle project dependency.
/// See the workspace `Cargo.toml`'s comment on this crate's direct dependency from the
/// app crate (mirroring native-bus's) for why that matters even before anything calls
/// `.plugin()` on it in a meaningful way.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-log").build()
}
