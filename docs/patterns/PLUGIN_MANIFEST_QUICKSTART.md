# Quick Start: Android Manifest Injection

**For:** Plugin authors adding Android support  
**Time:** 15 minutes  
**Difficulty:** Easy

---

## TL;DR

Make your plugin automatically handle its Android permissions. Users won't need to edit manifests manually.

---

## Step-by-Step

### 1. Add Build Dependency

```toml
# plugins/your-plugin/Cargo.toml

[build-dependencies]
tauri-plugin = { version = "2.0.0", features = ["build"] }
#                                              ^^^^^^^ Must include
```

### 2. Create build.rs

```rust
// plugins/your-plugin/build.rs

const COMMANDS: &[&str] = &[
    "your_command_1",
    "your_command_2",
    // List all your Tauri commands
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")  // Required: Registers Android module with Tauri
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android permissions");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions = vec![
        // Add your required permissions
        r#"<uses-permission android:name="android.permission.YOUR_PERMISSION" />"#,
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-YOUR-PLUGIN-NAME.permissions",  // ⚠️ Change this
        "manifest",
        permissions.join("\n"),
    )
}
```

### 3. Update Library Manifest

```xml
<!-- plugins/your-plugin/android/src/main/AndroidManifest.xml -->

<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Remove <uses-permission> tags you're now injecting -->

    <application>
        <!-- Keep services, receivers, activities here -->
    </application>
</manifest>
```

### 4. Test It

```bash
cd apps/threshold
pnpm tauri android build

# Check generated manifest
cat src-tauri/gen/android/app/src/main/AndroidManifest.xml
```

Look for:

```xml
<!-- tauri-plugin-YOUR-PLUGIN-NAME.permissions. AUTO-GENERATED. DO NOT REMOVE. -->
<uses-permission android:name="..." />
<!-- tauri-plugin-YOUR-PLUGIN-NAME.permissions. AUTO-GENERATED. DO NOT REMOVE. -->
```

✅ **You're done!** Your plugin now manages its own permissions.

---

## Common Permissions

```rust
// Camera
r#"<uses-permission android:name="android.permission.CAMERA" />"#

// Location
r#"<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />"#

// Notifications (Android 13+)
r#"<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />"#

// Vibration
r#"<uses-permission android:name="android.permission.VIBRATE" />"#

// Internet
r#"<uses-permission android:name="android.permission.INTERNET" />"#

// Wake Lock
r#"<uses-permission android:name="android.permission.WAKE_LOCK" />"#
```

---

## Optional: Feature Gates

Make sensitive permissions opt-in:

```toml
# Cargo.toml
[features]
default = []
camera-access = []  # Opt-in feature
```

```rust
// build.rs
fn inject_android_permissions() -> std::io::Result<()> {
    let mut permissions = vec![];

    // Always included
    permissions.push(r#"<uses-permission android:name="android.permission.VIBRATE" />"#);

    // Only if feature enabled
    #[cfg(feature = "camera-access")]
    permissions.push(r#"<uses-permission android:name="android.permission.CAMERA" />"#);

    // ... rest of function
}
```

Users enable with:

```toml
tauri-plugin-your-plugin = { version = "1.0", features = ["camera-access"] }
```

---

## Reference Example

See the full implementation in `plugins/alarm-manager/build.rs`.

For complete documentation, read `THRESHOLD_PLUGIN_MANIFEST_PATTERN.md`.

---

## Need Help?

**Problem:** Permissions not appearing  
**Fix:** Ensure you run `pnpm tauri android build`, not `cargo build`

**Problem:** Plugin not appearing in Gradle files  
**Fix:** Add `.android_path("android")` to your `build.rs` before `.build()` - this registers your Android module with Tauri's build system

**Problem:** Build fails  
**Fix:** Check XML syntax, verify block identifier is unique

**Problem:** Runtime SecurityException  
**Fix:** Some permissions need runtime requests (add permission request code)

**Full troubleshooting:** See main pattern document.
