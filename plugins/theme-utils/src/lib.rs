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
use desktop::ThemeUtils;
#[cfg(mobile)]
use mobile::ThemeUtils;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the theme-utils APIs.
pub trait ThemeUtilsExt<R: Runtime> {
    fn theme_utils(&self) -> &ThemeUtils<R>;
}

impl<R: Runtime, T: Manager<R>> ThemeUtilsExt<R> for T {
    fn theme_utils(&self) -> &ThemeUtils<R> {
        self.state::<ThemeUtils<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("theme-utils")
        .invoke_handler(tauri::generate_handler![commands::get_material_you_colours])
        .setup(|app, api| {
            #[cfg(mobile)]
            let theme_utils = mobile::init(app, api)?;
            #[cfg(desktop)]
            let theme_utils = desktop::init(app, api)?;
            app.manage(theme_utils);
            Ok(())
        })
        .build()
}
