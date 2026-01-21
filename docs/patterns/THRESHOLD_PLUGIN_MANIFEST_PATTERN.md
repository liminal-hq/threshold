# Threshold Plugin Android Manifest Injection Pattern

**Version:** 1.0  
**Date:** January 2026  
**Status:** Approved Standard  
**Audience:** Threshold Plugin Authors

---

## Executive Summary

This document defines the **standard pattern** for Android manifest management in Threshold plugins. Following this pattern ensures users never need to manually edit Android manifests—your plugin handles all its own requirements automatically.

**Pattern Status:** ✅ Validated against Tauri official plugins  
**Complexity:** Low (15 minutes to implement)  
**Benefit:** Eliminates manual permission configuration for all Threshold users

---

## Table of Contents

1. [Why This Pattern Matters](#why-this-pattern-matters)
2. [How Tauri's Manifest Injection Works](#how-tauris-manifest-injection-works)
3. [Threshold Plugin Conventions](#threshold-plugin-conventions)
4. [Implementation Guide](#implementation-guide)
5. [Template Code](#template-code)
6. [Testing Procedures](#testing-procedures)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)

---

## Why This Pattern Matters

### The Problem

Without this pattern:

```rust
// ❌ User must manually edit their AndroidManifest.xml
// ❌ Easy to forget permissions
// ❌ Hard to feature-gate sensitive permissions
// ❌ Plugin updates might need manifest changes
```

### The Solution

With this pattern:

```rust
// ✅ Permissions injected automatically at build time
// ✅ Plugin owns its requirements
// ✅ Feature flags control sensitive permissions
// ✅ Plugin updates "just work"
```

### Real-World Impact

**Before:** User installs your alarm-manager plugin, builds, and gets cryptic "SecurityException: Permission denied" errors at runtime. They search docs, find they need 10+ permissions, manually add them.

**After:** User installs your plugin, builds, everything works. The build system handles permissions automatically.

---

## How Tauri's Manifest Injection Works

Tauri v2 provides a build-time helper that modifies the **generated** Android project:

```rust
tauri_plugin::mobile::update_android_manifest(
    block_identifier: &str,  // Unique ID for your injection block
    parent_tag: &str,        // Where to inject (manifest/application/activity)
    content: String,         // XML to inject
) -> std::io::Result<()>
```

### The Magic

1. During `tauri android build` or `tauri android dev`, Tauri sets `TAURI_ANDROID_PROJECT_PATH`
2. Your plugin's `build.rs` calls `update_android_manifest()`
3. The helper reads `${TAURI_ANDROID_PROJECT_PATH}/app/src/main/AndroidManifest.xml`
4. It inserts (or replaces) your XML block **right before** `</{parent_tag}>`
5. It wraps your block in comment markers for idempotency:
   ```xml
   <!-- block_identifier. AUTO-GENERATED. DO NOT REMOVE. -->
   <your-xml-here />
   <!-- block_identifier. AUTO-GENERATED. DO NOT REMOVE. -->
   ```

### Idempotency

Running the build multiple times won't duplicate your block—it will replace the existing one. This is safe and correct.

### Validation

This pattern is used by official Tauri plugins:

- ✅ `tauri-plugin-deep-link` (injects intent-filters)
- ✅ `tauri-plugin-nfc` (injects NFC intent-filters)
- ✅ Validated against `tauri-apps/plugins-workspace@v2` branch

---

## Threshold Plugin Conventions

To maintain consistency across all Threshold plugins, we follow these naming conventions:

### Block Identifiers

Format: `tauri-plugin-{plugin-name}.{category}`

Examples:

- `tauri-plugin-alarm-manager.permissions`
- `tauri-plugin-alarm-manager.application`
- `tauri-plugin-notification-manager.permissions`

**Rule:** Use your plugin's crate name (without `tauri-plugin-` prefix) + category.

### Parent Tags

| Parent Tag    | Use For                                                           | Example                     |
| ------------- | ----------------------------------------------------------------- | --------------------------- |
| `manifest`    | `<uses-permission>`, `<uses-feature>`, `<queries>`                | Permission declarations     |
| `application` | `<service>`, `<receiver>`, `<provider>`, `<activity>` (secondary) | App components              |
| `activity`    | `<intent-filter>`, `<meta-data>`                                  | Main activity configuration |

**Rule:** Don't inject components unless you have a specific reason. Use the library manifest for components.

### What Goes Where

| Item                           | Location              | Reason                                        |
| ------------------------------ | --------------------- | --------------------------------------------- |
| Permissions                    | Inject via `build.rs` | Allows feature-gating, explicit documentation |
| Services                       | Library manifest      | Gradle merger handles them correctly          |
| Receivers                      | Library manifest      | Gradle merger handles them correctly          |
| Activities                     | Library manifest      | Gradle merger handles them correctly          |
| Intent filters (main activity) | Inject via `build.rs` | Only if configuration-driven                  |

**Recommended Split for Most Plugins:**

- ✅ **Inject:** Permissions
- ✅ **Library manifest:** Everything else

---

## Implementation Guide

### Step 1: Verify Prerequisites

Check your `Cargo.toml`:

```toml
[build-dependencies]
tauri-plugin = { version = "2.0.0", features = ["build"] }
#                                              ^^^^^^^ Required!
```

If the `build` feature is missing, add it.

### Step 2: Identify Your Android Requirements

List all permissions your plugin needs. Common sources:

- Android documentation for APIs you use
- Your native Kotlin/Java code's imports
- Runtime permission requests in your code

Example for alarm-manager:

```
✅ SCHEDULE_EXACT_ALARM - setAlarmClock() API
✅ WAKE_LOCK - Keep device awake
✅ RECEIVE_BOOT_COMPLETED - Reschedule after reboot
✅ USE_FULL_SCREEN_INTENT - Lock screen notification
✅ FOREGROUND_SERVICE - Background alarm audio
✅ FOREGROUND_SERVICE_MEDIA_PLAYBACK - Specific service type
✅ VIBRATE - Haptic feedback
✅ POST_NOTIFICATIONS - Show notifications (Android 13+)
```

### Step 3: Determine What to Feature-Gate

Some permissions are "policy-sensitive" and users might not want them enabled by default:

**Candidates for feature-gating:**

- `USE_FULL_SCREEN_INTENT` - Aggressive lockscreen takeover
- `POST_NOTIFICATIONS` - Can be annoying if overused
- `CAMERA`, `MICROPHONE` - Privacy-sensitive
- `READ_CONTACTS`, `READ_SMS` - Privacy-sensitive

**Example feature definition:**

```toml
# Cargo.toml
[features]
default = ["basic-alarms"]
basic-alarms = []
full-screen-intents = []  # Opt-in for lockscreen takeover
```

### Step 3.5: Register Your Android Module (Critical!)

**Before implementing manifest injection**, you must register your Android module with Tauri:

```rust
fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")  // ← REQUIRED for Android plugins
        .build();
}
```

**Why this matters:**

Without `.android_path("android")`, Tauri doesn't know your plugin has Android native code. This causes:

- ❌ Plugin not included in `gen/android/settings.gradle`
- ❌ Plugin dependency missing from `gen/android/app/build.gradle.kts`
- ❌ App crashes with `ClassNotFoundException` at runtime
- ❌ Manual gradle edits required (and get overwritten on rebuild)

**What `.android_path()` does:**

1. Tells Tauri: "I have an Android library at `plugins/YOUR-PLUGIN/android/`"
2. Auto-generates gradle configuration to include your plugin
3. Copies Tauri API bindings to `android/.tauri/` during builds
4. Enables seamless integration without manual gradle edits

**This is separate from manifest injection** - `.android_path()` handles gradle integration, while `update_android_manifest()` handles permissions.

### Step 4: Implement the Injection

Create or update your `build.rs`:

```rust
// plugins/{your-plugin}/build.rs

// TODO: Replace with your actual Tauri command names
const COMMANDS: &[&str] = &[
    "your_command_1",
    "your_command_2",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")  // Required: Registers Android module with Tauri
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android manifest permissions");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let mut permissions = vec![
        // Always-required permissions
        r#"<uses-permission android:name="android.permission.YOUR_PERMISSION" />"#,
    ];

    // Feature-gated permissions
    #[cfg(feature = "full-screen-intents")]
    permissions.push(r#"<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />"#);

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-YOUR-PLUGIN.permissions",  // ⚠️ Replace YOUR-PLUGIN
        "manifest",
        permissions.join("\n"),
    )
}
```

**Key Points:**

- ⚠️ Replace `YOUR-PLUGIN` with your plugin name
- ⚠️ Replace `COMMANDS` with your actual command list
- ✅ Use raw string literals: `r#"..."#` (no need to escape quotes)
- ✅ Use `#[cfg(feature = "...")]` for conditional permissions

### Step 5: Update Your Library Manifest

Edit `android/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Permissions are now injected via build.rs - remove them from here -->

    <application>
        <!-- Keep your components here - they merge correctly -->
        <service
            android:name=".YourService"
            android:exported="false" />

        <receiver
            android:name=".YourReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="your.custom.ACTION" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
```

**What to Remove:** Any `<uses-permission>` declarations you're now injecting.  
**What to Keep:** All `<service>`, `<receiver>`, `<activity>`, `<provider>` declarations.

### Step 6: Document the Permissions

Add a comment block in your `build.rs` explaining **why** each permission is needed:

```rust
fn inject_android_permissions() -> std::io::Result<()> {
    let mut permissions = vec![
        // Core alarm scheduling - required for exact alarm triggers
        r#"<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />"#,

        // Keep device awake during alarm processing
        r#"<uses-permission android:name="android.permission.WAKE_LOCK" />"#,

        // Restore alarms after device reboot
        r#"<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />"#,
    ];

    // ... rest of function
}
```

This helps future maintainers understand the permission requirements.

---

## Template Code

### Complete build.rs Template

```rust
// plugins/tauri-plugin-YOUR-PLUGIN/build.rs

const COMMANDS: &[&str] = &[
    "command_1",
    "command_2",
    // Add all your Tauri command names here
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")  // Required: Registers Android module with Tauri
        .build();

    inject_android_permissions()
        .expect("Failed to inject Android manifest permissions for YOUR-PLUGIN");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let mut permissions = vec![
        // ========================================
        // Core permissions - always included
        // ========================================

        // Example: r#"<uses-permission android:name="android.permission.INTERNET" />"#,
    ];

    // ========================================
    // Feature-gated permissions
    // ========================================

    #[cfg(feature = "your-feature-name")]
    permissions.extend_from_slice(&[
        // r#"<uses-permission android:name="android.permission.SENSITIVE_PERMISSION" />"#,
    ]);

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-YOUR-PLUGIN.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

### Alarm Manager Reference Implementation

For a complete working example, see `plugins/alarm-manager/build.rs`:

```rust
const COMMANDS: &[&str] = &[
    "schedule_alarm",
    "cancel_alarm",
    "list_alarms",
    "is_permission_granted",
    "request_permissions",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .build();

    inject_android_permissions()
        .expect("Failed to inject alarm-manager Android permissions");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions = vec![
        // Core alarm scheduling permissions
        r#"<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />"#,
        r#"<uses-permission android:name="android.permission.USE_EXACT_ALARM" />"#,

        // Power management
        r#"<uses-permission android:name="android.permission.WAKE_LOCK" />"#,

        // Boot persistence
        r#"<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />"#,

        // Lockscreen experience
        r#"<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />"#,

        // Foreground service for reliable alarm audio
        r#"<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />"#,
        r#"<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />"#,

        // User feedback
        r#"<uses-permission android:name="android.permission.VIBRATE" />"#,
        r#"<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />"#,
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-alarm-manager.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

---

## Testing Procedures

### Phase 1: Initial Implementation Test

1. **Implement the pattern** in your plugin's `build.rs`

2. **Build the Android project:**

   ```bash
   cd apps/threshold  # Or your main app
   pnpm tauri android build
   # or
   pnpm tauri android dev
   ```

3. **Locate the generated manifest:**

   ```bash
   cat apps/threshold/src-tauri/gen/android/app/src/main/AndroidManifest.xml
   ```

4. **Verify injection markers:**

   ```xml
   <!-- tauri-plugin-YOUR-PLUGIN.permissions. AUTO-GENERATED. DO NOT REMOVE. -->
   <uses-permission android:name="..." />
   <uses-permission android:name="..." />
   <!-- tauri-plugin-YOUR-PLUGIN.permissions. AUTO-GENERATED. DO NOT REMOVE. -->
   ```

   ✅ **Success indicators:**
   - Comment markers are present
   - Your permissions are between the markers
   - Permissions match what you specified in `build.rs`

   ❌ **Failure indicators:**
   - No comment markers visible
   - Permissions missing
   - Build errors

### Phase 2: Idempotency Test

5. **Rebuild without changes:**

   ```bash
   pnpm tauri android build
   ```

6. **Check the generated manifest again:**
   - ✅ Block should be in the same location
   - ✅ No duplicate permissions
   - ✅ Comment markers unchanged

### Phase 3: Feature Gate Test (if applicable)

7. **Build with feature enabled:**

   ```bash
   cargo build --features your-feature-name
   pnpm tauri android build
   ```

8. **Verify feature-gated permissions appear**

9. **Build without feature:**

   ```bash
   cargo build --no-default-features
   pnpm tauri android build
   ```

10. **Verify feature-gated permissions are absent**

### Phase 4: Runtime Test

11. **Install on device/emulator:**

    ```bash
    pnpm tauri android dev
    ```

12. **Verify runtime behaviour:**
    - ✅ No "SecurityException: Permission denied" errors
    - ✅ All plugin features work correctly
    - ✅ Components (services/receivers) are registered

13. **Check App Info:**
    - Open Android Settings → Apps → Threshold
    - Navigate to Permissions
    - ✅ Verify all expected permissions are listed

### Phase 5: Cleanup Test

14. **Remove plugin from app dependencies**

15. **Rebuild:**

    ```bash
    pnpm tauri android build
    ```

16. **Verify generated manifest:**
    - ✅ Your plugin's permission block should be gone
    - ✅ Other plugin blocks unaffected

---

## Common Patterns

### Pattern 1: Simple Static Permissions

**Use when:** Your plugin always needs the same permissions, no conditional logic.

```rust
fn inject_android_permissions() -> std::io::Result<()> {
    let permissions = vec![
        r#"<uses-permission android:name="android.permission.CAMERA" />"#,
        r#"<uses-permission android:name="android.permission.VIBRATE" />"#,
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-barcode-scanner.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

**Examples:** barcode-scanner, flashlight, haptics

---

### Pattern 2: Feature-Gated Permissions

**Use when:** Some permissions are sensitive or optional.

```rust
fn inject_android_permissions() -> std::io::Result<()> {
    let mut permissions = vec![
        // Always required
        r#"<uses-permission android:name="android.permission.VIBRATE" />"#,
    ];

    // Optional sensitive permission
    #[cfg(feature = "background-location")]
    permissions.push(r#"<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />"#);

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-location.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

**Examples:** location-tracking, notification-manager

---

### Pattern 3: Configuration-Driven Injection

**Use when:** Permissions depend on user configuration in `tauri.conf.json`.

```rust
use serde::Deserialize;

#[derive(Deserialize)]
struct PluginConfig {
    enable_camera: bool,
    enable_microphone: bool,
}

fn inject_android_permissions() -> std::io::Result<()> {
    let mut permissions = vec![];

    if let Some(config) = tauri_plugin::plugin_config::<PluginConfig>("your-plugin") {
        if config.enable_camera {
            permissions.push(r#"<uses-permission android:name="android.permission.CAMERA" />"#);
        }
        if config.enable_microphone {
            permissions.push(r#"<uses-permission android:name="android.permission.RECORD_AUDIO" />"#);
        }
    }

    if permissions.is_empty() {
        return Ok(()); // No permissions needed
    }

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-media.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

**Examples:** deep-link (dynamic intent filters)

---

### Pattern 4: Android API Level Conditional

**Use when:** Permissions only apply to certain Android versions.

```rust
fn inject_android_permissions() -> std::io::Result<()> {
    let mut permissions = vec![
        r#"<uses-permission android:name="android.permission.VIBRATE" />"#,
    ];

    // Android 13+ requires explicit notification permission
    permissions.push(
        r#"<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />"#
    );

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-notification.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

**Note:** You can't conditionally inject based on runtime API level in `build.rs`, but you can document that certain permissions only apply to newer Android versions. The permission will be in the manifest but ignored on older versions.

---

### Pattern 5: Injecting Application Components (Advanced)

**Use when:** You need to conditionally include services or receivers.

**⚠️ WARNING:** Only use this if you have a strong reason. Prefer the library manifest for components.

```rust
fn inject_android_components() -> std::io::Result<()> {
    #[cfg(feature = "background-sync")]
    {
        let components = r#"
<service
    android:name="com.yourplugin.BackgroundSyncService"
    android:exported="false"
    android:foregroundServiceType="dataSync" />

<receiver
    android:name="com.yourplugin.SyncReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
"#;

        tauri_plugin::mobile::update_android_manifest(
            "tauri-plugin-sync.application",
            "application",
            components.trim().to_string(),
        )?;
    }

    Ok(())
}

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
    inject_android_permissions().expect("Failed to inject permissions");
    inject_android_components().expect("Failed to inject components");
}
```

---

## Troubleshooting

### Issue: Permissions Not Appearing in Generated Manifest

**Symptoms:**

- Built successfully but no comment markers in generated manifest
- Plugin permissions missing

**Causes & Solutions:**

1. **`TAURI_ANDROID_PROJECT_PATH` not set**
   - This only gets set during Android builds
   - ✅ Run `pnpm tauri android build` or `pnpm tauri android dev`
   - ❌ Don't run `cargo build` directly

2. **Build feature not enabled**

   ```toml
   # ❌ Wrong
   tauri-plugin = "2.0.0"

   # ✅ Correct
   tauri-plugin = { version = "2.0.0", features = ["build"] }
   ```

3. **Function never called**
   - Ensure `inject_android_permissions()` is called in `main()`
   - Check for early returns or panics before the call

4. **Wrong parent tag**
   - Permissions must use `parent_tag = "manifest"`
   - Services/receivers use `parent_tag = "application"`

---

### Issue: Plugin Not Appearing in Gradle Files

**Symptoms:**

- App crashes with `ClassNotFoundException` for your plugin
- Plugin not listed in `gen/android/settings.gradle`
- Plugin dependency missing from `gen/android/app/build.gradle.kts`
- Manual gradle edits get overwritten on rebuild

**Cause:** Missing `.android_path()` call in `build.rs`

**Solution:**

Without `.android_path("android")`, Tauri doesn't know your plugin has Android native code and won't include it in the generated Gradle configuration.

```rust
// ❌ Wrong - plugin won't be included
fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}

// ✅ Correct - plugin gets auto-registered
fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")  // Required!
        .build();
}
```

**What `.android_path()` does:**

- Tells Tauri your plugin has an `android/` directory with native code
- Automatically adds your plugin to `settings.gradle`
- Automatically adds dependency to `app/build.gradle.kts`
- Copies Tauri API bindings to `android/.tauri/` during builds

**Verification:**
After adding `.android_path()` and rebuilding, check that your plugin appears in:

- `gen/android/settings.gradle` - Should have `include ':tauri-plugin-YOUR-NAME'`
- `gen/android/app/build.gradle.kts` - Should have `implementation(project(":tauri-plugin-YOUR-NAME"))`

---

### Issue: Build Fails with "failed to rewrite AndroidManifest.xml"

**Symptoms:**

```
thread 'main' panicked at 'Failed to inject Android permissions: ...'
```

**Causes & Solutions:**

1. **Malformed XML**
   - Check for unmatched quotes, missing `/>` closures
   - Validate XML syntax in your permission strings

2. **Invalid parent tag**
   - Only `manifest`, `application`, and `activity` are valid
   - Don't use custom tag names

3. **File system permissions**
   - Rare, but generated manifest might be read-only
   - Check file permissions in `gen/android/` directory

---

### Issue: Duplicate Permissions After Multiple Builds

**Symptoms:**

- Same permission appears 2-3 times in manifest
- Comment markers repeated

**Cause:** You're using different block identifiers across builds.

**Solution:**

```rust
// ❌ Wrong - changing block ID
tauri_plugin::mobile::update_android_manifest(
    format!("my-plugin-{}", timestamp),  // DON'T DO THIS
    "manifest",
    permissions,
)

// ✅ Correct - stable block ID
tauri_plugin::mobile::update_android_manifest(
    "tauri-plugin-my-plugin.permissions",  // Same every time
    "manifest",
    permissions,
)
```

---

### Issue: Runtime SecurityException Despite Manifest Injection

**Symptoms:**

- Build succeeds, permissions in manifest
- App crashes with "Permission denied" at runtime

**Causes & Solutions:**

1. **Runtime permissions not requested (Android 6+)**
   - Some permissions require runtime requests
   - Examples: `CAMERA`, `LOCATION`, `RECORD_AUDIO`
   - ✅ Add runtime permission request code in your plugin

2. **Special access permissions**
   - Some "permissions" are actually special access toggles
   - Examples: `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`
   - ✅ Add code to check and request these via Settings intents

3. **Permission spelling mistake**
   - Double-check permission names against Android docs
   - Common mistake: `SCHEDULE_ALARMS` vs `SCHEDULE_EXACT_ALARM`

---

### Issue: Components Not Registered

**Symptoms:**

- Permissions work fine
- Services/receivers don't respond to intents

**Cause:** You removed components from library manifest but didn't inject them.

**Solution:**
Keep components in `android/src/main/AndroidManifest.xml`:

```xml
<application>
    <service android:name=".YourService" ... />
    <receiver android:name=".YourReceiver" ... />
</application>
```

The manifest merger will handle these correctly. You usually don't need to inject components.

---

### Issue: Feature Gates Not Working

**Symptoms:**

- Built with feature enabled but permission missing
- Built without feature but permission still present

**Cause:** Cargo feature conditional not evaluated correctly.

**Debug steps:**

1. **Verify feature is defined in Cargo.toml:**

   ```toml
   [features]
   your-feature = []
   ```

2. **Check syntax:**

   ```rust
   // ✅ Correct
   #[cfg(feature = "your-feature")]
   permissions.push(...);

   // ❌ Wrong
   #[cfg(feature = "your_feature")]  // Uses underscore
   permissions.push(...);
   ```

3. **Verify build command:**

   ```bash
   # Enable feature
   cargo build --features your-feature
   pnpm tauri android build

   # Disable feature
   cargo build --no-default-features
   pnpm tauri android build
   ```

4. **Add debug logging:**

   ```rust
   #[cfg(feature = "your-feature")]
   {
       println!("cargo:warning=Feature 'your-feature' is ENABLED");
       permissions.push(...);
   }

   #[cfg(not(feature = "your-feature"))]
   println!("cargo:warning=Feature 'your-feature' is DISABLED");
   ```

---

## Advanced Topics

### Multi-Inject Pattern

Some plugins might need to inject into multiple parent tags:

```rust
fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();

    // Inject permissions
    inject_permissions()
        .expect("Failed to inject permissions");

    // Inject application components (if needed)
    inject_application_components()
        .expect("Failed to inject components");

    // Inject activity metadata (if needed)
    inject_activity_metadata()
        .expect("Failed to inject metadata");
}

fn inject_permissions() -> std::io::Result<()> {
    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-my-plugin.permissions",
        "manifest",
        build_permissions_xml(),
    )
}

fn inject_application_components() -> std::io::Result<()> {
    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-my-plugin.application",
        "application",
        build_components_xml(),
    )
}

fn inject_activity_metadata() -> std::io::Result<()> {
    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-my-plugin.activity",
        "activity",
        build_metadata_xml(),
    )
}
```

**Important:** Use different block identifiers for each injection point.

---

### Version-Specific Permissions

Some permissions have different names across Android versions:

```rust
fn inject_android_permissions() -> std::io::Result<()> {
    let permissions = vec![
        // Android 12+ (API 31+)
        r#"<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />"#,

        // Backwards compatibility for older Android versions
        r#"<uses-permission android:name="android.permission.USE_EXACT_ALARM" />"#,
    ];

    // Android will ignore permissions it doesn't recognize, so it's safe to include both

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-alarm-manager.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

---

### Permission Rationale Documentation

For sensitive permissions, add a README section explaining why they're needed:

````markdown
## Android Permissions

This plugin requires the following Android permissions:

### `CAMERA` (Required)

- **Why:** To scan barcodes using the device camera
- **When:** Only when `scan()` is called
- **Privacy:** Camera data is processed locally and never transmitted

### `VIBRATE` (Optional)

- **Why:** To provide haptic feedback when a barcode is detected
- **When:** Only if `hapticFeedback: true` in config
- **Privacy:** No data is collected

### Feature Gates

Enable sensitive permissions with Cargo features:

```toml
tauri-plugin-barcode = { version = "1.0", features = ["haptics"] }
```
````

```

---

## Checklist for Plugin Authors

Use this checklist when implementing the pattern in your plugin:

- [ ] **Prerequisites**
  - [ ] Added `tauri-plugin` with `build` feature to `[build-dependencies]`
  - [ ] Identified all required Android permissions
  - [ ] Identified all required components (services/receivers/activities)

- [ ] **Implementation**
  - [ ] Created/updated `build.rs` with permission injection
  - [ ] Used correct block identifier: `tauri-plugin-{name}.permissions`
  - [ ] Used raw string literals (no escaped quotes)
  - [ ] Added comments explaining each permission
  - [ ] Defined Cargo features for optional permissions (if needed)
  - [ ] Updated library manifest to remove injected permissions
  - [ ] Kept components in library manifest

- [ ] **Documentation**
  - [ ] Added permissions list to plugin README
  - [ ] Explained why each permission is needed
  - [ ] Documented Cargo features (if any)
  - [ ] Added privacy/security notes for sensitive permissions

- [ ] **Testing**
  - [ ] Verified injection markers in generated manifest
  - [ ] Tested idempotency (multiple builds)
  - [ ] Tested feature gates (if applicable)
  - [ ] Verified runtime behaviour (no SecurityException)
  - [ ] Checked App Info in Android Settings
  - [ ] Tested plugin removal (cleanup)

- [ ] **Code Review**
  - [ ] Pattern follows Threshold conventions
  - [ ] Block identifiers are unique
  - [ ] Error messages are clear
  - [ ] No hardcoded paths or assumptions

---

## References

### Official Tauri Examples

Study these official plugins for real-world patterns:

1. **Simple static injection (NFC):**
   - Path: `plugins/nfc/build.rs`
   - Pattern: Fixed intent-filters for activity

2. **Configuration-driven injection (Deep-Link):**
   - Path: `plugins/deep-link/build.rs`
   - Pattern: Reads config, generates intent-filters dynamically

3. **Library manifest only (Notification):**
   - Path: `plugins/notification/android/src/main/AndroidManifest.xml`
   - Pattern: No injection, pure manifest merger

### Android Documentation

- [Permissions Overview](https://developer.android.com/guide/topics/permissions/overview)
- [Manifest Permissions Reference](https://developer.android.com/reference/android/Manifest.permission)
- [Manifest Merger](https://developer.android.com/build/manage-manifests#merge-manifests)

### Tauri Documentation

- [Tauri v2 Plugin Guide](https://v2.tauri.app/develop/plugins/)
- [Mobile Development](https://v2.tauri.app/develop/mobile/)

---

## Contact & Support

**Questions about this pattern?**
- Create an issue in the Threshold repository
- Tag issues with `plugin-development` and `android`

**Found a bug in this document?**
- Submit a PR to update `THRESHOLD_PLUGIN_MANIFEST_PATTERN.md`

**Need help implementing?**
- Review the alarm-manager reference implementation
- Check the troubleshooting section
- Ask in Threshold development discussions

---

## Changelog

### Version 1.0 (January 2026)
- Initial pattern documentation
- Validated against Tauri v2 official plugins
- Established Threshold plugin conventions
- Added comprehensive troubleshooting guide

---

**This pattern is a Threshold standard. All Android plugins should follow it.**
```
