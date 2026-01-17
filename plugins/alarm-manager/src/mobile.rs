use tauri::{
  plugin::{PluginApi, PluginHandle},
  Runtime,
};
use crate::models::*;

// Initialize the plugin
pub fn init<R: Runtime>(
  _app: &tauri::AppHandle<R>,
  api: PluginApi<R, ()>,
) -> crate::Result<AlarmManager<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.plugin.alarmmanager", "AlarmManagerPlugin")?;
  #[cfg(not(target_os = "android"))]
  let handle = api.handle().clone();
  
  Ok(AlarmManager(handle))
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

  pub fn pick_alarm_sound(&self, options: PickAlarmSoundOptions) -> crate::Result<PickedAlarmSound> {
    self.0
      .run_mobile_plugin("pickAlarmSound", options)
      .map_err(Into::into)
  }
}
