use crate::models::TimeFormatResponse;
use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "ca.liminalhq.threshold.timeprefs";

#[cfg(target_os = "ios")]
const PLUGIN_IDENTIFIER: &str = "tauri-plugin-time-prefs";

// Initialize the plugin API
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<TimePrefs<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "TimePrefsPlugin")?;

    // NOTE: iOS implementation is deferred. We intentionally do not register an iOS plugin here.

    Ok(TimePrefs {
        #[cfg(target_os = "android")]
        handle,
    })
}

/// Access to the TimePrefs APIs
pub struct TimePrefs<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
}

impl<R: Runtime> TimePrefs<R> {
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
}
