// Build script registering the plugin's commands and Android manifest permissions
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

const COMMANDS: &[&str] = &["set_can_go_back"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android manifest permissions for predictive-back");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions: Vec<&str> = vec![
        // No permissions required for predictive-back.
        // This block ensures the injection mechanism is present for future use.
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-predictive-back.permissions",
        "manifest",
        permissions.join("\n"),
    )
    .map_err(std::io::Error::other)
}
