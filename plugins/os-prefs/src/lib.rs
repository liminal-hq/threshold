// Plugin entry point and cross-platform extension trait
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

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
use desktop::OsPrefs;
#[cfg(mobile)]
use mobile::OsPrefs;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the os-prefs APIs.
pub trait OsPrefsExt<R: Runtime> {
    fn os_prefs(&self) -> &OsPrefs<R>;
}

impl<R: Runtime, T: Manager<R>> OsPrefsExt<R> for T {
    fn os_prefs(&self) -> &OsPrefs<R> {
        self.state::<OsPrefs<R>>().inner()
    }
}

/// Initialises the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("os-prefs")
        .invoke_handler(tauri::generate_handler![
            commands::get_time_format,
            commands::get_animator_duration_scale,
            commands::open_notification_settings
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let os_prefs = mobile::init(app, api)?;
            #[cfg(desktop)]
            let os_prefs = desktop::init(app, api)?;
            app.manage(os_prefs);
            Ok(())
        })
        .build()
}
