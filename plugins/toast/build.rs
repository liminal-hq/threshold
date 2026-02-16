const COMMANDS: &[&str] = &["show"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android manifest permissions for toast");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions: Vec<&str> = vec![
        // No explicit Android permissions required for Toast usage.
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-toast.permissions",
        "manifest",
        permissions.join("\n"),
    )
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
}
