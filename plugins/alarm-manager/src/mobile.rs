use tauri::{
  plugin::{PluginHandle, ToPlugin},
  Runtime,
};
use crate::models::*;

// Initialize the plugin
pub fn init<R: Runtime, C: ToPlugin<R>>(
  _app: &tauri::AppHandle<R>,
  api: PluginHandle<R, C>,
) -> crate::Result<AlarmManager<R>> {
  Ok(AlarmManager(api))
}

/// Access to the alarm-manager APIs.
pub struct AlarmManager<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AlarmManager<R> {
  pub fn schedule(&self, payload: ScheduleRequest) -> crate::Result<()> {
    self.0
      .run_mobile_plugin("schedule", payload)
      .map_err(Into::into)
  }

  pub fn cancel(&self, payload: CancelRequest) -> crate::Result<()> {
    self.0
      .run_mobile_plugin("cancel", payload)
      .map_err(Into::into)
  }

  pub fn get_launch_args(&self) -> crate::Result<Vec<ImportedAlarm>> {
    self.0
      .run_mobile_plugin("get_launch_args", ())
      .map_err(Into::into)
  }
}
