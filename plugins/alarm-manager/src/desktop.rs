use tauri::{
  plugin::{PluginHandle, ToPlugin},
  Runtime,
};
use crate::models::*;

pub fn init<R: Runtime, C: ToPlugin<R>>(
  _app: &tauri::AppHandle<R>,
  _api: PluginHandle<R, C>,
) -> crate::Result<AlarmManager<R>> {
  Ok(AlarmManager)
}

pub struct AlarmManager<R: Runtime>(std::marker::PhantomData<R>);

impl<R: Runtime> AlarmManager<R> {
  pub fn schedule(&self, _payload: ScheduleRequest) -> crate::Result<()> {
    println!("Desktop: Schedule alarm (Mock)");
    Ok(())
  }

  pub fn cancel(&self, _payload: CancelRequest) -> crate::Result<()> {
    println!("Desktop: Cancel alarm (Mock)");
    Ok(())
  }
}
