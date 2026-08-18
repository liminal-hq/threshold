// Plugin entry point and cross-platform extension trait
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Listener, Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::HomeWidgets;
#[cfg(mobile)]
use mobile::HomeWidgets;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the home-widgets APIs.
pub trait HomeWidgetsExt<R: Runtime> {
    fn home_widgets(&self) -> &HomeWidgets<R>;
}

impl<R: Runtime, T: Manager<R>> HomeWidgetsExt<R> for T {
    fn home_widgets(&self) -> &HomeWidgets<R> {
        self.state::<HomeWidgets<R>>().inner()
    }
}

/// Initializes the plugin. Has no webview-facing commands -- see `build.rs` -- because this plugin only pushes data from Rust to a native Android widget; the app's `AlarmCoordinator` already drives the underlying `alarm:next-changed` event, so the webview has no reason to talk to this plugin directly.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("home-widgets")
        .setup(|app, api| {
            #[cfg(mobile)]
            let home_widgets = mobile::init(app, api)?;
            #[cfg(desktop)]
            let home_widgets = desktop::init(app, api)?;
            app.manage(home_widgets);

            // Registered here (the plugin's own setup) rather than the app's setup hook, so this listener is guaranteed to exist before AlarmCoordinator's heal_on_launch seeds the initial alarm:next-changed emission -- Tauri runs plugin setup before the app's own setup closure, and a listener registered after an event fires never receives it.
            setup_next_alarm_listener(app.clone());

            Ok(())
        })
        .build()
}

/// Listens for the core scheduler's `alarm:next-changed` event and forwards a flattened snapshot to the Kotlin plugin, in-process -- no webview round-trip required.
fn setup_next_alarm_listener<R: Runtime>(app: AppHandle<R>) {
    let listener_app = app.clone();
    app.listen("alarm:next-changed", move |event| {
        match serde_json::from_str::<models::NextAlarmSnapshot>(event.payload()) {
            Ok(snapshot) => {
                if let Err(error) = listener_app
                    .state::<HomeWidgets<R>>()
                    .update_widget_snapshot(snapshot)
                {
                    log::error!(
                        "home-widgets: failed to update widget snapshot from alarm:next-changed event: {error}"
                    );
                }
            }
            Err(error) => {
                log::error!(
                    "home-widgets: failed to parse alarm:next-changed payload: {error}"
                );
            }
        }
    });
}
