// Android bridge for reading native OS preferences
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::models::{AnimatorDurationScaleResponse, TimeFormatResponse};
use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "ca.liminalhq.threshold.osprefs";

#[cfg(target_os = "ios")]
const PLUGIN_IDENTIFIER: &str = "tauri-plugin-os-prefs";

// Initialize the plugin API
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<OsPrefs<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "OsPrefsPlugin")?;

    // NOTE: iOS implementation is deferred. We intentionally do not register an iOS plugin here.
    // On iOS we don't register anything because we are providing a Rust-side stub only.
    // If we had Swift code, we would use api.register_ios_plugin.

    Ok(OsPrefs {
        #[cfg(target_os = "android")]
        handle,
    })
}

/// Access to the OsPrefs APIs
pub struct OsPrefs<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
}

impl<R: Runtime> OsPrefs<R> {
    pub fn get_time_format(&self) -> crate::Result<TimeFormatResponse> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin("getTimeFormat", ())
                .map_err(Into::into)
        }

        #[cfg(target_os = "ios")]
        {
            // Stub implementation for iOS
            // NOTE: iOS implementation is deferred; currently returning default 12-hour format
            Ok(TimeFormatResponse { is24_hour: false })
        }
    }

    pub fn get_animator_duration_scale(&self) -> crate::Result<AnimatorDurationScaleResponse> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin("getAnimatorDurationScale", ())
                .map_err(Into::into)
        }

        #[cfg(target_os = "ios")]
        {
            // Stub implementation for iOS -- no equivalent system setting wired up yet.
            Ok(AnimatorDurationScaleResponse { scale: 1.0 })
        }
    }

    /// Opens the OS notification settings screen for this app.
    pub fn open_notification_settings(&self) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin("openNotificationSettings", ())
                .map_err(Into::into)
        }

        #[cfg(target_os = "ios")]
        {
            // Stub implementation for iOS -- no equivalent settings deep link wired up yet.
            Ok(())
        }
    }
}
