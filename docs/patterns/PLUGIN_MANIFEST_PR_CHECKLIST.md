# Plugin Manifest Injection - PR Review Checklist

**Purpose:** Ensure plugin PRs correctly implement the Android manifest injection pattern  
**For:** Threshold maintainers reviewing plugin contributions

---

## Quick Verification (2 minutes)

Run this script to verify basic implementation:

```bash
#!/bin/bash
# verify-manifest-injection.sh

PLUGIN_NAME=$1
PLUGIN_PATH="plugins/${PLUGIN_NAME}"

echo "🔍 Checking ${PLUGIN_NAME}..."

# Check 1: build feature enabled
if ! grep -q 'features = \["build"\]' "${PLUGIN_PATH}/Cargo.toml"; then
    echo "❌ Missing build feature in Cargo.toml"
    exit 1
fi

# Check 2: build.rs exists
if [ ! -f "${PLUGIN_PATH}/build.rs" ]; then
    echo "❌ Missing build.rs"
    exit 1
fi

# Check 3: injection call present
if ! grep -q "update_android_manifest" "${PLUGIN_PATH}/build.rs"; then
    echo "❌ No manifest injection in build.rs"
    exit 1
fi

# Check 4: uses correct block identifier format
if ! grep -q "tauri-plugin-${PLUGIN_NAME}" "${PLUGIN_PATH}/build.rs"; then
    echo "⚠️  Block identifier might not follow convention"
fi

echo "✅ Basic checks passed"
```

Usage:
```bash
chmod +x verify-manifest-injection.sh
./verify-manifest-injection.sh alarm-manager
```

---

## Detailed Review Checklist

### 1. Cargo.toml Configuration

- [ ] `[build-dependencies]` section exists
- [ ] `tauri-plugin` is listed with version `2.0.0` or higher
- [ ] `features = ["build"]` is specified
- [ ] If using feature gates, features are defined in `[features]` section

**Example:**
```toml
[build-dependencies]
tauri-plugin = { version = "2.0.0", features = ["build"] }

[features]
default = []
some-optional-feature = []
```

---

### 2. build.rs Implementation

#### Basic Structure
- [ ] `COMMANDS` constant defined with actual command names
- [ ] `main()` function calls `tauri_plugin::Builder::new(COMMANDS).build()`
- [ ] Injection function is called from `main()`
- [ ] Error handling uses `.expect()` with descriptive message

#### Injection Function
- [ ] Function returns `std::io::Result<()>`
- [ ] Uses `tauri_plugin::mobile::update_android_manifest(...)`
- [ ] Block identifier follows convention: `tauri-plugin-{plugin-name}.{category}`
- [ ] Parent tag is correct (`manifest` for permissions)
- [ ] Permissions use raw string literals (`r#"..."#`)
- [ ] No escaped quotes in raw strings (❌ `\"` inside `r#"..."#`)

**Red Flags:**
```rust
// ❌ Wrong - no error handling
tauri_plugin::mobile::update_android_manifest(...);

// ❌ Wrong - escaped quotes in raw string
r#"<uses-permission android:name=\"android.permission.CAMERA\" />"#

// ❌ Wrong - uses "android" instead of commands
tauri_plugin::Builder::new(&["android"]).build();

// ❌ Wrong - generic block identifier
"MY PLUGIN"  // Should be "tauri-plugin-my-plugin.permissions"

// ❌ Wrong - unstable block identifier
format!("plugin-{}", timestamp)  // Must be stable!
```

**Good Examples:**
```rust
// ✅ Correct
const COMMANDS: &[&str] = &["scan", "cancel"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
    inject_android_permissions()
        .expect("Failed to inject barcode-scanner permissions");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions = vec![
        r#"<uses-permission android:name="android.permission.CAMERA" />"#,
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-barcode-scanner.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

---

### 3. Library Manifest (android/src/main/AndroidManifest.xml)

- [ ] File exists at `plugins/{name}/android/src/main/AndroidManifest.xml`
- [ ] Permissions being injected are **removed** from this file
- [ ] Components (services, receivers, activities) are **kept** in this file
- [ ] No duplicate permission declarations

**Before (❌ Wrong - has both):**
```xml
<manifest>
    <!-- ❌ This will be injected via build.rs, should remove -->
    <uses-permission android:name="android.permission.CAMERA" />
    
    <application>
        <!-- ✅ Keep this -->
        <service android:name=".MyService" />
    </application>
</manifest>
```

**After (✅ Correct):**
```xml
<manifest>
    <!-- Permissions are now injected via build.rs -->
    
    <application>
        <!-- Components stay here -->
        <service android:name=".MyService" />
    </application>
</manifest>
```

---

### 4. Documentation

- [ ] Plugin README lists all required permissions
- [ ] Each permission has a "why needed" explanation
- [ ] Privacy implications documented for sensitive permissions
- [ ] Feature gates documented (if any)
- [ ] Installation instructions are correct

**Example README section:**
```markdown
## Android Permissions

This plugin requires the following permissions:

### `CAMERA` (Required)
- **Purpose:** Scan barcodes using device camera
- **When:** Only during active scanning
- **Privacy:** Processed locally, not transmitted

### Optional Features

Enable camera access:
```toml
tauri-plugin-barcode = { version = "1.0", features = ["camera"] }
```
```

---

### 5. Testing Evidence

Request the author provide:

- [ ] Screenshot/paste of generated manifest showing comment markers
- [ ] Confirmation that app builds without errors
- [ ] Verification that runtime behaviour works (no SecurityException)
- [ ] Test on physical device or emulator

**What to ask for:**
```
Please provide:
1. Output of: cat apps/threshold/src-tauri/gen/android/app/src/main/AndroidManifest.xml
2. Confirmation that `pnpm tauri android build` succeeds
3. Screenshot of app working on device/emulator
```

---

### 6. Common Mistakes to Catch

#### Mistake 1: Duplicate Permissions
```xml
<!-- Generated manifest - ❌ BAD -->
<uses-permission android:name="android.permission.CAMERA" />  <!-- From library manifest -->
<!-- tauri-plugin-scanner.permissions -->
<uses-permission android:name="android.permission.CAMERA" />  <!-- From injection -->
<!-- tauri-plugin-scanner.permissions -->
```

**Fix:** Remove from library manifest.

#### Mistake 2: Wrong Block Identifier
```rust
// ❌ Wrong - too generic
tauri_plugin::mobile::update_android_manifest(
    "PERMISSIONS",  // Not unique!
    "manifest",
    permissions.join("\n"),
)

// ✅ Correct - follows convention
tauri_plugin::mobile::update_android_manifest(
    "tauri-plugin-barcode-scanner.permissions",
    "manifest",
    permissions.join("\n"),
)
```

#### Mistake 3: Injecting Components Unnecessarily
```rust
// ❌ Don't do this unless you have a good reason
let components = vec![
    r#"<service android:name=".MyService" />"#,
];
tauri_plugin::mobile::update_android_manifest(
    "tauri-plugin-my-plugin.application",
    "application",
    components.join("\n"),
)?;
```

**Guideline:** Only inject components if they're conditionally required. Otherwise use library manifest.

#### Mistake 4: Feature Gate Syntax Error
```rust
// ❌ Wrong - uses underscore
#[cfg(feature = "camera_access")]

// ✅ Correct - uses hyphen (matches Cargo.toml)
#[cfg(feature = "camera-access")]
```

#### Mistake 5: Hardcoded Commands
```rust
// ❌ Wrong - outdated command list
const COMMANDS: &[&str] = &["old_command"];

// Make sure to update when adding new commands!
```

**Check:** Verify COMMANDS list matches actual `#[tauri::command]` functions in the plugin.

---

## Build Verification

### Manual Test Procedure

1. **Checkout the PR branch**
   ```bash
   gh pr checkout <pr-number>
   ```

2. **Clean build**
   ```bash
   cd apps/threshold
   rm -rf src-tauri/gen
   pnpm tauri android build
   ```

3. **Inspect generated manifest**
   ```bash
   cat src-tauri/gen/android/app/src/main/AndroidManifest.xml | grep -A 20 "tauri-plugin"
   ```

4. **Verify idempotency**
   ```bash
   pnpm tauri android build  # Build again
   # Check manifest - should be identical, no duplicates
   ```

5. **Test on device**
   ```bash
   pnpm tauri android dev
   # Verify plugin functionality works
   ```

---

## Approval Criteria

✅ **Approve if:**
- All checklist items pass
- Build succeeds
- Generated manifest has correct injection markers
- No duplicate permissions
- Documentation is clear
- Feature gates work (if applicable)
- Runtime behaviour is correct

❌ **Request changes if:**
- Build feature not enabled
- Block identifier doesn't follow convention
- Permissions duplicated in library manifest
- Missing documentation
- Test evidence not provided
- Syntax errors in injection code

⚠️ **Request discussion if:**
- Plugin injects components (discuss if necessary)
- Uses configuration-driven injection (verify implementation)
- Has many feature gates (verify they're all useful)
- Permissions seem excessive (ask for justification)

---

## Response Templates

### Approval Comment
```markdown
✅ Manifest injection implementation looks good!

Verified:
- Build feature enabled
- Injection code follows pattern
- Generated manifest correct
- Documentation complete

Merging!
```

### Request Changes Comment
```markdown
Thanks for the PR! The manifest injection implementation needs a few adjustments:

**Issues:**
- [ ] Missing `features = ["build"]` in `Cargo.toml`
- [ ] Block identifier should be `tauri-plugin-{name}.permissions` not `{name}`
- [ ] Remove injected permissions from library manifest

**Example:**
```rust
// In build.rs
tauri_plugin::mobile::update_android_manifest(
    "tauri-plugin-your-plugin.permissions",  // ⚠️ Update this
    "manifest",
    permissions.join("\n"),
)
```

See `THRESHOLD_PLUGIN_MANIFEST_PATTERN.md` for complete guide.
```

### Architecture Discussion Comment
```markdown
I see you're injecting components via `build.rs`. Can you explain why this is needed versus keeping them in the library manifest?

Generally we prefer library manifest for components and only inject permissions. The exception is if components need to be conditionally included based on features.

If this is just for convenience, please move components back to the library manifest.
```

---

## Automated Checks (Future)

Consider adding these as CI checks:

```yaml
# .github/workflows/plugin-manifest-check.yml
name: Plugin Manifest Check

on:
  pull_request:
    paths:
      - 'plugins/*/build.rs'
      - 'plugins/*/Cargo.toml'

jobs:
  verify-injection:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Check build feature
        run: |
          for plugin in plugins/*/Cargo.toml; do
            if ! grep -q 'features = \["build"\]' "$plugin"; then
              echo "::error file=$plugin::Missing build feature"
              exit 1
            fi
          done
      
      - name: Check block identifiers
        run: |
          for build_rs in plugins/*/build.rs; do
            plugin_name=$(dirname "$build_rs" | xargs basename)
            if ! grep -q "tauri-plugin-${plugin_name}" "$build_rs"; then
              echo "::warning file=$build_rs::Block identifier might not follow convention"
            fi
          done
      
      - name: Check for escaped quotes in raw strings
        run: |
          if grep -r 'r#".*\\".*"#' plugins/*/build.rs; then
            echo "::error::Found escaped quotes in raw string literals"
            exit 1
          fi
```

---

## Contact

**Questions about reviewing manifest injection PRs?**
- Refer to `THRESHOLD_PLUGIN_MANIFEST_PATTERN.md`
- Check alarm-manager implementation as reference
- Ask in Threshold maintainer discussions

**Found an issue with this checklist?**
- Submit a PR to update this document
- Help improve the review process

---

**Last Updated:** January 2026  
**Document Version:** 1.0
