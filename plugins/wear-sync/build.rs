const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android manifest permissions for wear-sync");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions: Vec<&str> = vec![
        // No permissions required for wear-sync yet.
        // This block ensures the injection mechanism is ready for future use.
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-wear-sync.permissions",
        "manifest",
        permissions.join("\n"),
    )
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
}
