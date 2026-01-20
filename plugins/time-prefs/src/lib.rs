use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::TimePrefs;
#[cfg(mobile)]
use mobile::TimePrefs;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the time-prefs APIs.
pub trait TimePrefsExt<R: Runtime> {
  fn time_prefs(&self) -> &TimePrefs<R>;
}

impl<R: Runtime, T: Manager<R>> TimePrefsExt<R> for T {
  fn time_prefs(&self) -> &TimePrefs<R> {
    self.state::<TimePrefs<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("time-prefs")
    .invoke_handler(tauri::generate_handler![commands::get_time_format])
    .setup(|app, api| {
      #[cfg(mobile)]
      let time_prefs = mobile::init(app, api)?;
      #[cfg(desktop)]
      let time_prefs = desktop::init(app, api)?;
      app.manage(time_prefs);
      Ok(())
    })
    .build()
}
