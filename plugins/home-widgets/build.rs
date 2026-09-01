// Build script registering the plugin's (empty) command surface and Android project path
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// The webview surface is intentionally empty: this plugin has no `#[command]`s and is never invoked from TS. `updateWidgetSnapshot` is a Rust-internal call made directly to the Kotlin plugin via `run_mobile_plugin`, not a webview-facing command, so it must NOT be listed here -- see docs/plugins/command-conventions.md for the `COMMANDS`-scope rule this enforces.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
