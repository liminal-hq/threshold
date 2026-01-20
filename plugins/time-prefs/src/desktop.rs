use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use crate::models::TimeFormatResponse;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<TimePrefs<R>> {
  Ok(TimePrefs(app.clone()))
}

/// Access to the TimePrefs APIs
pub struct TimePrefs<R: Runtime>(AppHandle<R>);

impl<R: Runtime> TimePrefs<R> {
  pub fn get_time_format(&self) -> crate::Result<TimeFormatResponse> {
    // Desktop implementation should theoretically not be reached if the frontend
    // handles the logic using Intl. But if called, we return a default.
    println!("TimePrefs (Desktop): get_time_format called, returning default false (12h)");
    Ok(TimeFormatResponse { is24_hour: false })
  }
}
