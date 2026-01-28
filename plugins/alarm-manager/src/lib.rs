use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, AppHandle, Listener,
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
        .invoke_handler(tauri::generate_handler![
            commands::get_launch_args,
            commands::pick_alarm_sound,
            commands::check_active_alarm,
            commands::stop_ringing
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let alarm_manager = mobile::init(app, api)?;
            #[cfg(desktop)]
            let alarm_manager = desktop::init(app, api)?;
            app.manage(alarm_manager);

            // Listen to alarms:changed events
            setup_event_listener(app.clone());

            Ok(())
        })
        .build()
}

fn setup_event_listener<R: Runtime>(app: AppHandle<R>) {
    use serde_json::Value;

    let app_handle = app.clone();
    app.listen("alarms:changed", move |event| {
        let payload = event.payload();

        // Parse AlarmRecord array
        if let Ok(alarms) = serde_json::from_str::<Vec<Value>>(payload) {
            #[cfg(mobile)]
            mobile::handle_alarms_changed(&app_handle, alarms);

            #[cfg(desktop)]
            desktop::handle_alarms_changed(&app_handle, alarms);
        }
    });
}
