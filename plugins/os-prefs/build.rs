// Build script registering the plugin's commands and Android manifest permissions
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

const COMMANDS: &[&str] = &[
    "get_time_format",
    "get_animator_duration_scale",
    "open_notification_settings",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android manifest permissions for os-prefs");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions: Vec<&str> = vec![
        // No permissions required for os-prefs
        // This block ensures the injection mechanism is present for future use
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-os-prefs.permissions",
        "manifest",
        permissions.join("\n"),
    )
    .map_err(std::io::Error::other)
}
