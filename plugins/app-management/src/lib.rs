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
use desktop::AppManagement;
#[cfg(mobile)]
use mobile::AppManagement;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the app-management APIs.
pub trait AppManagementExt<R: Runtime> {
  fn app_management(&self) -> &AppManagement<R>;
}

impl<R: Runtime, T: Manager<R>> crate::AppManagementExt<R> for T {
  fn app_management(&self) -> &AppManagement<R> {
    self.state::<AppManagement<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("app-management")
    .invoke_handler(tauri::generate_handler![commands::minimize_app])
    .setup(|app, api| {
      #[cfg(mobile)]
      let app_management = mobile::init(app, api)?;
      #[cfg(desktop)]
      let app_management = desktop::init(app, api)?;
      app.manage(app_management);
      Ok(())
    })
    .build()
}
