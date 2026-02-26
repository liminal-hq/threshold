// Threshold app crate entry point, plugin registration, and event wiring
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

pub mod alarm;
pub mod commands;

use alarm::{database::AlarmDatabase, AlarmCoordinator};
use std::sync::atomic::{AtomicBool, AtomicI32};
use std::sync::Arc;
use tauri::{Listener, Manager};

/// Phone-side snooze length (minutes), synced from the frontend settings.
/// Read by `report_alarm_fired` to include in the `alarm:fired` event.
pub type SnoozeLengthState = Arc<AtomicI32>;
/// Phone-side time format preference, synced from frontend settings.
/// `true` = 24-hour, `false` = 12-hour.
pub type TimeFormatState = Arc<AtomicBool>;
/// Whether the phone-side time format has been explicitly initialised from settings.
pub type TimeFormatKnownState = Arc<AtomicBool>;
#[cfg(mobile)]
use tauri_plugin_alarm_manager::AlarmManagerExt;
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
        commands::test_watch_ring,
        commands::set_snooze_length,
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

            // Snooze length state — default 10 minutes, updated by frontend
            let snooze_state: SnoozeLengthState = Arc::new(AtomicI32::new(10));
            app.manage(snooze_state);
            // Time format state — default 24-hour false, updated by frontend
            let time_format_state: TimeFormatState = Arc::new(AtomicBool::new(false));
            app.manage(time_format_state);
            // Time format known flag — false until frontend emits settings-changed(is24h)
            let time_format_known_state: TimeFormatKnownState = Arc::new(AtomicBool::new(false));
            app.manage(time_format_known_state);

            // Keep Rust state aligned with frontend settings via event architecture.
            // This powers alarm:fired and wear sync payloads without bespoke invoke calls.
            let settings_handle = app.handle().clone();
            app.handle().listen("settings-changed", move |event| {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct SettingsChanged {
                    key: String,
                    value: serde_json::Value,
                }

                let Ok(payload) = serde_json::from_str::<SettingsChanged>(event.payload()) else {
                    return;
                };
                if payload.key != "is24h" {
                    return;
                }

                let Some(is_24_hour) = payload.value.as_bool() else {
                    return;
                };

                if let Some(state) = settings_handle.try_state::<TimeFormatState>() {
                    state.store(is_24_hour, std::sync::atomic::Ordering::Relaxed);
                    log::info!(
                        "settings: updated time format to {} via settings-changed event",
                        if is_24_hour { "24h" } else { "12h" }
                    );
                }
                if let Some(known_state) = settings_handle.try_state::<TimeFormatKnownState>() {
                    known_state.store(true, std::sync::atomic::Ordering::Relaxed);
                }

                let handle = settings_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                        if let Err(error) = coord
                            .emit_sync_needed(&handle, alarm::events::SyncReason::ForceSync)
                            .await
                        {
                            log::warn!("settings: failed to trigger wear sync after is24h change: {error}");
                        }
                    }
                });
            });

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

            // Watch requested a full sync.
            //
            // NOTE: The wear-sync plugin forwards watch revision in this event
            // payload, but we intentionally force FullSync here. The current
            // protocol prioritises reliability and simpler recovery semantics,
            // and alarm payloads are small enough that full-state publishes are
            // acceptable on the Data Layer.
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

            // Watch dismissed a ringing alarm
            let dismiss_handle = app.handle().clone();
            app.handle().listen("wear:alarm:dismiss", move |event| {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct WatchDismiss { alarm_id: i32 }

                if let Ok(cmd) = serde_json::from_str::<WatchDismiss>(event.payload()) {
                    let handle = dismiss_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        // Stop the phone's ringing service first
                        #[cfg(mobile)]
                        if let Err(e) = handle.alarm_manager().stop_ringing() {
                            log::error!("watch: failed to stop phone ringing: {e}");
                        }

                        if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                            match coord.dismiss_alarm(&handle, cmd.alarm_id).await {
                                Ok(_) => log::info!("watch: dismissed alarm {}", cmd.alarm_id),
                                Err(e) => log::error!("watch: failed to dismiss alarm {}: {e}", cmd.alarm_id),
                            }
                        }
                    });
                }
            });

            // Watch snoozed a ringing alarm
            let snooze_handle = app.handle().clone();
            app.handle().listen("wear:alarm:snooze", move |event| {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct WatchSnooze { alarm_id: i32, snooze_length_minutes: i64 }

                if let Ok(cmd) = serde_json::from_str::<WatchSnooze>(event.payload()) {
                    let handle = snooze_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        // Stop the phone's ringing service first
                        #[cfg(mobile)]
                        if let Err(e) = handle.alarm_manager().stop_ringing() {
                            log::error!("watch: failed to stop phone ringing: {e}");
                        }

                        if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                            match coord.snooze_alarm(&handle, cmd.alarm_id, cmd.snooze_length_minutes).await {
                                Ok(_) => log::info!("watch: snoozed alarm {} for {} min", cmd.alarm_id, cmd.snooze_length_minutes),
                                Err(e) => log::error!("watch: failed to snooze alarm {}: {e}", cmd.alarm_id),
                            }
                        }
                    });
                }
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
