const COMMANDS: &[&str] = &["get_time_format"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android manifest permissions for time-prefs");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions: Vec<&str> = vec![
        // No permissions required for time-prefs
        // This block ensures the injection mechanism is present for future use
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-time-prefs.permissions",
        "manifest",
        permissions.join("\n"),
    )
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
}
