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
        // Keep this list in sync with `acl_tests::WEBVIEW_COMMANDS` below — that test
        // can't read this macro invocation directly, so the two lists are maintained
        // by hand in parallel.
        .invoke_handler(tauri::generate_handler![
            commands::schedule,
            commands::cancel,
            commands::get_launch_args,
            commands::pick_alarm_sound,
            commands::stop_ringing
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let alarm_manager = mobile::init(app, api)?;
            #[cfg(desktop)]
            let alarm_manager = desktop::init(app, api)?;
            app.manage(alarm_manager);

            // Registered here (the plugin's own setup) rather than the app's setup hook,
            // so these listeners are guaranteed to exist before AlarmCoordinator's
            // heal_on_launch re-emits alarm:scheduled -- Tauri runs plugin setup before
            // the app's own setup closure, and a listener registered after an event
            // fires never receives it.
            setup_scheduling_listeners(app.clone());

            Ok(())
        })
        .build()
}

/// Listens for the AlarmCoordinator's granular scheduling events and drives the native
/// alarm manager directly, in-process -- no webview round-trip required. `ScheduleRequest`/
/// `CancelRequest` already deserialize a compatible subset of `alarm:scheduled`'s /
/// `alarm:cancelled`'s payload fields, so no dedicated event types are needed here.
fn setup_scheduling_listeners<R: Runtime>(app: AppHandle<R>) {
    let scheduled_app = app.clone();
    app.listen("alarm:scheduled", move |event| {
        match serde_json::from_str::<models::ScheduleRequest>(event.payload()) {
            Ok(request) => {
                if let Err(error) = scheduled_app.state::<AlarmManager<R>>().schedule(request) {
                    log::error!(
                        "alarm-manager: failed to schedule from alarm:scheduled event: {error}"
                    );
                }
            }
            Err(error) => {
                log::error!("alarm-manager: failed to parse alarm:scheduled payload: {error}");
            }
        }
    });

    let cancelled_app = app.clone();
    app.listen("alarm:cancelled", move |event| {
        match serde_json::from_str::<models::CancelRequest>(event.payload()) {
            Ok(request) => {
                if let Err(error) = cancelled_app.state::<AlarmManager<R>>().cancel(request) {
                    log::error!(
                        "alarm-manager: failed to cancel from alarm:cancelled event: {error}"
                    );
                }
            }
            Err(error) => {
                log::error!("alarm-manager: failed to parse alarm:cancelled payload: {error}");
            }
        }
    });
}

#[cfg(test)]
mod acl_tests {
    // Mirrors the command list passed to `generate_handler!` in `init()` above —
    // kept as a separate literal because macro invocations aren't readable at test
    // time. If you add/remove a webview command, update both lists.
    //
    // Every command here MUST have a matching `allow-*` permission in
    // `permissions/default.toml`, or the ACL silently denies it at runtime (the
    // exact bug fixed in Threshold issue #195).
    const WEBVIEW_COMMANDS: &[&str] = &[
        "schedule",
        "cancel",
        "get_launch_args",
        "pick_alarm_sound",
        "stop_ringing",
    ];

    const DEFAULT_TOML: &str = include_str!("../permissions/default.toml");

    #[test]
    fn every_webview_command_has_a_default_permission() {
        for command in WEBVIEW_COMMANDS {
            let permission = format!("allow-{}", command.replace('_', "-"));
            assert!(
                DEFAULT_TOML.contains(&permission),
                "command `{command}` is webview-invokable but `permissions/default.toml` \
                 is missing `{permission}` — it will be silently ACL-denied at runtime"
            );
        }
    }

    #[test]
    fn rust_internal_commands_are_not_webview_invokable() {
        // These are only ever reached via `run_mobile_plugin` from Rust's own
        // setup code (the Kotlin channel-bridge handshake), never from the
        // webview. They must not reappear in `generate_handler!`/`WEBVIEW_COMMANDS`.
        for internal in ["set_alarm_event_handler", "mark_alarm_pipeline_ready"] {
            assert!(
                !WEBVIEW_COMMANDS.contains(&internal),
                "`{internal}` is Rust-internal (via run_mobile_plugin) and must not be \
                 exposed as a webview command"
            );
        }
    }
}
