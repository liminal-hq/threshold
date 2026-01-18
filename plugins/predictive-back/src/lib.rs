use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(target_os = "android")]
mod mobile;
#[cfg(target_os = "android")]
use mobile::PredictiveBack;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(target_os = "android")]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("predictive-back")
        .invoke_handler(tauri::generate_handler![commands::set_can_go_back])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let predictive_back = mobile::init(app, api)?;
            #[cfg(target_os = "android")]
            app.manage(predictive_back);
            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("predictive-back")
        .invoke_handler(tauri::generate_handler![commands::set_can_go_back])
        .build()
}
