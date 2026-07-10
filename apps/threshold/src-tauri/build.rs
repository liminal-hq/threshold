// Tauri build script for the desktop/mobile app shell
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

fn main() {
    tauri_build::build();

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        if let Err(error) = patch_predictive_back_manifest_flag() {
            println!(
                "cargo:warning=failed to patch AndroidManifest.xml for predictive back: {error}"
            );
        }
    }
}

/// Idempotently ensures `android:enableOnBackInvokedCallback="true"` is present on the
/// `<application>` tag, re-running (and self-healing) on every Android build.
///
/// This can't live in a plugin's `build.rs`: Tauri's `update_android_manifest()` helper only
/// inserts new child elements before a tag's closing `</tag>`, with no path to add an
/// attribute to an already-open tag. This flag is inherently app-shell-level config anyway
/// (same category as `usesCleartextTraffic`, set in this same generated project's
/// `app/build.gradle.kts`), so it belongs here rather than in `plugins/predictive-back`.
fn patch_predictive_back_manifest_flag() -> std::io::Result<()> {
    println!("cargo:rerun-if-env-changed=TAURI_ANDROID_PROJECT_PATH");

    let Some(project_path) = std::env::var_os("TAURI_ANDROID_PROJECT_PATH") else {
        return Ok(());
    };
    let manifest_path =
        std::path::Path::new(&project_path).join("app/src/main/AndroidManifest.xml");
    println!("cargo:rerun-if-changed={}", manifest_path.display());
    if !manifest_path.exists() {
        return Ok(());
    }

    const ATTRIBUTE: &str = "android:enableOnBackInvokedCallback";
    const OPENING_TAG: &str = "<application";

    let manifest = std::fs::read_to_string(&manifest_path)?;
    let Some(tag_start) = manifest.find(OPENING_TAG) else {
        return Ok(());
    };
    let Some(tag_end_offset) = manifest[tag_start..].find('>') else {
        return Ok(());
    };
    let tag_end = tag_start + tag_end_offset;

    if manifest[tag_start..tag_end].contains(ATTRIBUTE) {
        return Ok(());
    }

    let mut patched = String::with_capacity(manifest.len() + 64);
    patched.push_str(&manifest[..tag_end]);
    patched.push_str(&format!("\n        {ATTRIBUTE}=\"true\""));
    patched.push_str(&manifest[tag_end..]);

    std::fs::write(&manifest_path, patched)
}
