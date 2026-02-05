pub mod alarm;
pub mod commands;

use alarm::{database::AlarmDatabase, AlarmCoordinator};
use tauri::Manager;

#[cfg(target_os = "linux")]
fn configure_linux_env() {
    use std::{env, path::Path};

    fn set_env_if_unset(key: &str, value: &str) {
        if env::var_os(key).is_none() {
            env::set_var(key, value);
        }
    }

    // Cinnamon and similar Linux desktops often lack an accessibility bus, which causes
    // GTK/Wry to spam errors and sometimes abort the launch. Force-disable the AT-SPI
    // bridge when it is not explicitly configured.
    set_env_if_unset("NO_AT_BRIDGE", "1");

    let session_type = env::var("XDG_SESSION_TYPE").unwrap_or_default();
    let display = env::var("DISPLAY").ok();
    let wayland_display = env::var("WAYLAND_DISPLAY").ok();
    let inferred_x11 = session_type.eq_ignore_ascii_case("x11")
        || (session_type.is_empty() && display.is_some() && wayland_display.is_none());
    let is_container = ["/run/.containerenv", "/.dockerenv"]
        .into_iter()
        .any(|p| Path::new(p).exists())
        || env::var("DEVCONTAINER").is_ok()
        || env::var("VSCODE_GIT_IPC_HANDLE").is_ok();

    // Force these settings in container even if X11 isn't strictly inferred yet,
    // as we might be in a devcontainer where we want to avoid hardware accel issues.
    if is_container {
        set_env_if_unset("LIBGL_ALWAYS_SOFTWARE", "1");
        set_env_if_unset("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        set_env_if_unset("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        set_env_if_unset("GDK_DISABLE_SHM", "1");
        set_env_if_unset("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1");
    }

    println!(
        "[threshold bootstrap] session_type={session_type:?} inferred_x11={inferred_x11} in_container={is_container} DISPLAY={display:?} WAYLAND_DISPLAY={wayland_display:?} NO_AT_BRIDGE={:?} WEBKIT_DISABLE_COMPOSITING_MODE={:?} WEBKIT_DISABLE_DMABUF_RENDERER={:?} WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS={:?} GDK_DISABLE_SHM={:?} LIBGL_ALWAYS_SOFTWARE={:?}",
        env::var("NO_AT_BRIDGE").ok(),
        env::var("WEBKIT_DISABLE_COMPOSITING_MODE").ok(),
        env::var("WEBKIT_DISABLE_DMABUF_RENDERER").ok(),
        env::var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS").ok(),
        env::var("GDK_DISABLE_SHM").ok(),
        env::var("LIBGL_ALWAYS_SOFTWARE").ok(),
    );
}

mod event_logs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_env();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());
    }

    builder = builder.invoke_handler(tauri::generate_handler![
        event_logs::export_event_logs,
        event_logs::get_event_logs,
        commands::get_alarms,
        commands::get_alarm,
        commands::save_alarm,
        commands::toggle_alarm,
        commands::delete_alarm,
        commands::dismiss_alarm,
        commands::snooze_alarm,
        commands::report_alarm_fired,
        commands::request_alarm_sync,
    ]);

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:alarms.db", alarm::database::migrations())
                .build(),
        )
        .plugin(tauri_plugin_theme_utils::init())
        .plugin(tauri_plugin_alarm_manager::init())
        .plugin(tauri_plugin_time_prefs::init())
        .plugin(tauri_plugin_wear_sync::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_app_management::init())
        .setup(|app| {
            #[cfg(mobile)]
            app.handle().plugin(tauri_plugin_app_events::init())?;

            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Trace
            } else {
                log::LevelFilter::Info
            };

            let log_builder = tauri_plugin_log::Builder::default()
                .level(log_level)
                .level_for("jni", log::LevelFilter::Warn)
                .level_for("tao", log::LevelFilter::Info);

            #[cfg(mobile)]
            {
                let log_builder = log_builder.format(|out, message, record| {
                    out.finish(format_args!(
                        "[{}][{}] {}",
                        record.level(),
                        record.target(),
                        message
                    ))
                });

                app.handle().plugin(log_builder.build())?;
            }

            #[cfg(not(mobile))]
            {
                app.handle().plugin(log_builder.build())?;
            }

            // Initialise database and coordinator
            let db = tauri::async_runtime::block_on(async {
                AlarmDatabase::new(app.handle()).await
            })?;

            let coordinator = AlarmCoordinator::new(db);

            // Heal-on-launch
            tauri::async_runtime::block_on(async {
                coordinator.heal_on_launch(app.handle()).await
            })?;

            // Run maintenance
            tauri::async_runtime::block_on(async {
                coordinator.run_maintenance().await
            }).ok();

            app.manage(coordinator);

            // Emit initial sync hint for wear-sync
            tauri::async_runtime::block_on(async {
                if let Some(coord) = app.handle().try_state::<AlarmCoordinator>() {
                    coord.emit_sync_needed(app.handle(), alarm::events::SyncReason::Initialize).await.ok();
                }
            });

            // Schedule daily maintenance
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(
                    tokio::time::Duration::from_secs(86400) // 24 hours
                );
                loop {
                    interval.tick().await;
                    if let Some(coord) = app_handle.try_state::<AlarmCoordinator>() {
                        coord.run_maintenance().await.ok();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }
}
