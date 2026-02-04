const COMMANDS: &[&str] = &["minimize_app"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")
    .build();

  #[cfg(target_os = "macos")] // Only run on host where we might build (but actually this runs on build machine, checking target_os might be wrong if cross compiling, but standard pattern is usually just calls)
  {
      // no-op
  }
  
  inject_android_permissions().expect("Failed to inject Android permissions");
}

fn inject_android_permissions() -> std::io::Result<()> {
    // moveTaskToBack() generally doesn't require explicit permissions for self.
    // However, we follow the pattern for future extensibility.
    let permissions = vec![
        // Example: r#"<uses-permission android:name="android.permission.REORDER_TASKS" />"#,
    ];

    if permissions.is_empty() {
        return Ok(());
    }

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-app-management.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
