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
use desktop::PredictiveBack;
#[cfg(mobile)]
use mobile::PredictiveBack;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the
/// predictive-back APIs.
pub trait PredictiveBackExt<R: Runtime> {
    fn predictive_back(&self) -> &PredictiveBack<R>;
}

impl<R: Runtime, T: Manager<R>> PredictiveBackExt<R> for T {
    fn predictive_back(&self) -> &PredictiveBack<R> {
        self.state::<PredictiveBack<R>>().inner()
    }
}

/// Initialises the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("predictive-back")
        .invoke_handler(tauri::generate_handler![commands::set_can_go_back])
        .setup(|app, api| {
            #[cfg(mobile)]
            let predictive_back = mobile::init(app, api)?;
            #[cfg(desktop)]
            let predictive_back = desktop::init(app, api)?;
            app.manage(predictive_back);
            Ok(())
        })
        .build()
}
