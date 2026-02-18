pub mod alarm;
pub mod commands;

use alarm::{database::AlarmDatabase, AlarmCoordinator};
use tauri::{Listener, Manager};
#[cfg(mobile)]
use tauri_plugin_wear_sync::WearSyncExt;

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

    builder = builder
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
        .plugin(tauri_plugin_app_management::init());

    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_toast::init());
    }

    builder
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

            // ── Watch event handlers ────────────────────────────────────
            // These events are emitted by the wear-sync plugin when it
            // receives messages from the watch.  The app crate handles
            // them because it owns the AlarmCoordinator (single DB writer).

            // Watch toggled an alarm on/off
            let save_handle = app.handle().clone();
            app.handle().listen("wear:alarm:save", move |event| {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct WatchSave { alarm_id: i32, enabled: bool, watch_revision: i64 }

                if let Ok(cmd) = serde_json::from_str::<WatchSave>(event.payload()) {
                    let handle = save_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                            // Reject if this alarm was modified after the watch last synced
                            if let Ok(alarm) = coord.get_alarm(&handle, cmd.alarm_id).await {
                                if cmd.watch_revision < alarm.revision {
                                    log::warn!(
                                        "watch: rejecting stale save for alarm {} (watch_rev={}, alarm_rev={}) — requesting resync",
                                        cmd.alarm_id, cmd.watch_revision, alarm.revision
                                    );
                                    coord.emit_sync_needed(&handle, alarm::events::SyncReason::ForceSync).await.ok();
                                    return;
                                }
                            }
                            match coord.toggle_alarm(&handle, cmd.alarm_id, cmd.enabled).await {
                                Ok(_) => log::info!("watch: toggled alarm {} to enabled={}", cmd.alarm_id, cmd.enabled),
                                Err(e) => {
                                    log::error!("watch: failed to toggle alarm {}: {e} — requesting resync", cmd.alarm_id);
                                    if let Err(sync_error) = coord
                                        .emit_sync_needed(&handle, alarm::events::SyncReason::ForceSync)
                                        .await
                                    {
                                        log::error!(
                                            "watch: failed to emit ForceSync after toggle error for alarm {}: {sync_error}",
                                            cmd.alarm_id
                                        );
                                    }
                                }
                            }
                        }
                    });
                }
            });

            // Watch deleted an alarm
            let delete_handle = app.handle().clone();
            app.handle().listen("wear:alarm:delete", move |event| {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct WatchDelete { alarm_id: i32, watch_revision: i64 }

                if let Ok(cmd) = serde_json::from_str::<WatchDelete>(event.payload()) {
                    let handle = delete_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                            // Reject if this alarm was modified after the watch last synced
                            if let Ok(alarm) = coord.get_alarm(&handle, cmd.alarm_id).await {
                                if cmd.watch_revision < alarm.revision {
                                    log::warn!(
                                        "watch: rejecting stale delete for alarm {} (watch_rev={}, alarm_rev={}) — requesting resync",
                                        cmd.alarm_id, cmd.watch_revision, alarm.revision
                                    );
                                    coord.emit_sync_needed(&handle, alarm::events::SyncReason::ForceSync).await.ok();
                                    return;
                                }
                            }
                            match coord.delete_alarm(&handle, cmd.alarm_id).await {
                                Ok(_) => log::info!("watch: deleted alarm {}", cmd.alarm_id),
                                Err(e) => log::error!("watch: failed to delete alarm {}: {e}", cmd.alarm_id),
                            }
                        }
                    });
                }
            });

            // Watch requested a full sync
            let sync_handle = app.handle().clone();
            app.handle().listen("wear:sync:request", move |_event| {
                let handle = sync_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                        coord.emit_sync_needed(&handle, alarm::events::SyncReason::ForceSync).await.ok();
                    }
                });
            });

            // Batch debounce completed — the wear-sync plugin needs all
            // alarm data to build a FullSync payload.
            let batch_handle = app.handle().clone();
            app.handle().listen("wear:sync:batch_ready", move |_event| {
                let handle = batch_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                        coord.emit_sync_needed(&handle, alarm::events::SyncReason::BatchComplete).await.ok();
                    }
                });
            });

            #[cfg(mobile)]
            if let Err(error) = app.handle().wear_sync().mark_watch_pipeline_ready() {
                log::warn!("watch: failed to mark watch pipeline ready: {error}");
            }

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
