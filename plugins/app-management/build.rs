const COMMANDS: &[&str] = &["minimize_app"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .build();
  
  inject_android_permissions().expect("Failed to inject Android permissions");
}

fn inject_android_permissions() -> Result<(), Box<dyn std::error::Error>> {
    // moveTaskToBack() generally doesn't require explicit permissions for self.
    // However, we follow the pattern for future extensibility.
    let permissions: Vec<&str> = vec![
        // Example: r#"<uses-permission android:name="android.permission.REORDER_TASKS" />"#,
    ];

    if permissions.is_empty() {
        return Ok(());
    }

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-app-management.permissions",
        "manifest",
        permissions.join("\n"),
    )?;

    Ok(())
}
