// Build script registering the plugin's (currently empty) commands and Android module
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// No webview-invokable commands yet -- this crate exists to carry the Android Gradle
// module (android/), not to expose any Rust logic. See docs/plugins/command-conventions.md
// for why this stays empty rather than listing Rust-internal-only names.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android manifest permissions for native-bus");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions: Vec<&str> = vec![
        // No permissions required for native-bus.
        // This block ensures the injection mechanism is present for future use.
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-native-bus.permissions",
        "manifest",
        permissions.join("\n"),
    )
    .map_err(std::io::Error::other)
}
