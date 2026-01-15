use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod models;
mod error;
mod commands;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::AlarmManager;
#[cfg(mobile)]
use mobile::AlarmManager;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the alarm-manager APIs.
pub trait AlarmManagerExt<R: Runtime> {
  fn alarm_manager(&self) -> &AlarmManager<R>;
}

impl<R: Runtime, T: Manager<R>> AlarmManagerExt<R> for T {
  fn alarm_manager(&self) -> &AlarmManager<R> {
    self.state::<AlarmManager<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("alarm-manager")
    .setup(|app, api| {
      #[cfg(mobile)]
      let alarm_manager = mobile::init(app, api)?;
      #[cfg(desktop)]
      let alarm_manager = desktop::init(app, api)?;
      app.manage(alarm_manager);
      Ok(())
    })
    .build()
}
