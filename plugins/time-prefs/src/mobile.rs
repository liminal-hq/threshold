use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, mobile::PluginOp},
  AppHandle, Runtime,
};
use crate::models::TimeFormatResponse;
use crate::error::Error;

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

  // On iOS we don't register anything because we are providing a Rust-side stub only.
  // If we had Swift code, we would use api.register_ios_plugin.

  Ok(TimePrefs {
    #[cfg(target_os = "android")]
    handle
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
        // TODO: Implement full iOS plugin with Swift
        Ok(TimeFormatResponse { is24_hour: false })
    }
  }
}
