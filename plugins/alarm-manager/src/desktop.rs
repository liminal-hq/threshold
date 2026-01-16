use tauri::{
  plugin::PluginApi,
  Runtime,
};
use crate::models::*;

pub fn init<R: Runtime>(
  app: &tauri::AppHandle<R>,
  _api: PluginApi<R, ()>,
) -> crate::Result<AlarmManager<R>> {
  Ok(AlarmManager {
    app: app.clone(),
  })
}

pub struct AlarmManager<R: Runtime> {
  #[allow(dead_code)]
  app: tauri::AppHandle<R>,
}

impl<R: Runtime> AlarmManager<R> {
  pub fn schedule(&self, _payload: ScheduleRequest) -> crate::Result<()> {
    println!("Desktop: Schedule alarm (Mock)");
    Ok(())
  }

  pub fn cancel(&self, _payload: CancelRequest) -> crate::Result<()> {
    println!("Desktop: Cancel alarm (Mock)");
    Ok(())
  }

  pub fn get_launch_args(&self) -> crate::Result<Vec<ImportedAlarm>> {
    println!("Desktop: Get Launch Args (Mock)");
    Ok(vec![])
  }
}
