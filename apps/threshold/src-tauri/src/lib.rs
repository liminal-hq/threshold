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
/// Serializes native-import de-dup checks against concurrent import events (e.g. several
/// SET_ALARM imports queued while the app was cold, then drained back-to-back on
/// launch) -- without this, two concurrent "check known alarms, then save" sequences
/// could both see no duplicate and both save, since async tasks can interleave here
/// unlike the single-threaded JS loop this logic used to run in.
#[cfg(mobile)]
pub struct ImportLock(pub tokio::sync::Mutex<()>);
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
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        );
    }

    // Debug-only automation bridge for the Tauri MCP server -- never compiled into
    // release builds. Bound to localhost only for now; mobile testing will need this
    // opened up to the LAN, which is a deliberate follow-up, not the default.
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(
            tauri_plugin_mcp_bridge::Builder::new()
                .bind_address("127.0.0.1")
                .build(),
        );
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
        commands::set_time_format,
        commands::mark_alarm_pipeline_ready,
    ]);

    builder = builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:alarms.db", alarm::database::migrations())
                .build(),
        )
        .plugin(tauri_plugin_theme_utils::init())
        .plugin(tauri_plugin_alarm_manager::init())
        .plugin(tauri_plugin_predictive_back::init())
        .plugin(tauri_plugin_os_prefs::init())
        .plugin(tauri_plugin_wear_sync::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_app_management::init())
        .plugin(tauri_plugin_toast::init());

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

            #[cfg(mobile)]
            app.manage(ImportLock(tokio::sync::Mutex::new(())));

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
                                Err(e) => {
                                    log::error!("watch: failed to delete alarm {}: {e} — requesting resync", cmd.alarm_id);
                                    if let Err(sync_error) = coord
                                        .emit_sync_needed(&handle, alarm::events::SyncReason::ForceSync)
                                        .await
                                    {
                                        log::error!(
                                            "watch: failed to emit ForceSync after delete error for alarm {}: {sync_error}",
                                            cmd.alarm_id
                                        );
                                    }
                                }
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
                            // Watch snooze is always now-anchored (ringing alarm)
                            let snoozed_until = chrono::Utc::now().timestamp_millis()
                                + cmd.snooze_length_minutes * 60 * 1000;
                            match coord.snooze_alarm(&handle, cmd.alarm_id, snoozed_until).await {
                                Ok(_) => log::info!("watch: snoozed alarm {} for {} min", cmd.alarm_id, cmd.snooze_length_minutes),
                                Err(e) => log::error!("watch: failed to snooze alarm {}: {e}", cmd.alarm_id),
                            }
                        }
                    });
                }
            });

            // Native phone alarm-fired callback from alarm-manager plugin.
            //
            // This keeps `alarm:fired` ownership in Rust core (hub) instead of UI routes.
            let native_alarm_handle = app.handle().clone();
            app.handle().listen("alarm-manager:native-fired", move |event| {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct NativeAlarmFired {
                    id: i32,
                    actual_fired_at: i64,
                }

                if let Ok(payload) = serde_json::from_str::<NativeAlarmFired>(event.payload()) {
                    let handle = native_alarm_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                            if let Err(error) = coord
                                .report_alarm_fired(&handle, payload.id, payload.actual_fired_at)
                                .await
                            {
                                log::error!(
                                    "alarm-manager: failed to report native alarm fired for {}: {error}",
                                    payload.id
                                );
                            }
                        }
                    });
                }
            });

            // Native phone alarm-dismissed callback from alarm-manager plugin (notification
            // Dismiss action on AlarmRingingService). Handled directly in Rust core, same
            // as alarm-manager:native-fired and the wear:alarm:* listeners above — no TS
            // round-trip needed since dismiss_alarm requires nothing but the alarm ID.
            let native_dismiss_handle = app.handle().clone();
            app.handle().listen("alarm-manager:dismiss-requested", move |event| {
                #[derive(serde::Deserialize)]
                struct NativeDismissRequested {
                    id: i32,
                }

                if let Ok(payload) = serde_json::from_str::<NativeDismissRequested>(event.payload()) {
                    let handle = native_dismiss_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                            if let Err(error) = coord.dismiss_alarm(&handle, payload.id).await {
                                log::error!(
                                    "alarm-manager: failed to dismiss native-requested alarm {}: {error}",
                                    payload.id
                                );
                            }
                        }
                    });
                }
            });

            // Native phone alarm-snoozed callback from alarm-manager plugin (notification
            // Snooze action on AlarmRingingService). Handled directly in Rust core, mirroring
            // wear:alarm:snooze — reads the same SnoozeLengthState the frontend keeps synced
            // via set_snooze_length, so no TS round-trip is needed here either.
            let native_snooze_handle = app.handle().clone();
            app.handle().listen("alarm-manager:snooze-requested", move |event| {
                #[derive(serde::Deserialize)]
                struct NativeSnoozeRequested {
                    id: i32,
                }

                if let Ok(payload) = serde_json::from_str::<NativeSnoozeRequested>(event.payload()) {
                    let handle = native_snooze_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let minutes = handle
                            .try_state::<SnoozeLengthState>()
                            .map(|s| s.load(std::sync::atomic::Ordering::Relaxed))
                            .unwrap_or(10) as i64;
                        let snoozed_until = chrono::Utc::now().timestamp_millis() + minutes * 60 * 1000;

                        if let Some(coord) = handle.try_state::<AlarmCoordinator>() {
                            match coord.snooze_alarm(&handle, payload.id, snoozed_until).await {
                                Ok(_) => log::info!(
                                    "alarm-manager: snoozed native-requested alarm {} for {} min",
                                    payload.id,
                                    minutes
                                ),
                                Err(error) => log::error!(
                                    "alarm-manager: failed to snooze native-requested alarm {}: {error}",
                                    payload.id
                                ),
                            }
                        }
                    });
                }
            });

            // Native alarm import request from alarm-manager plugin (e.g. Android's "Set
            // Alarm" intent, handled by SetAlarmActivity). Ports the de-dup/staleness
            // logic that used to live in AlarmManagerService.ts's checkImports() -- now
            // Rust-internal end to end, so it works even if this event is queued and
            // replayed before any TS code has run (SetAlarmActivity can launch with the
            // main process completely cold). Mobile-only: SET_ALARM import has no
            // desktop equivalent, and AlarmManagerExt is itself only in scope on mobile.
            #[cfg(mobile)]
            let import_handle = app.handle().clone();
            #[cfg(mobile)]
            app.handle().listen("alarm-manager:import-requested", move |event| {
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct ImportRequested {
                    id: i32,
                    hour: i32,
                    minute: i32,
                    label: String,
                    active_days: Vec<i32>,
                    trigger_at: i64,
                }

                if let Ok(payload) = serde_json::from_str::<ImportRequested>(event.payload()) {
                    let handle = import_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        // Always tear down the temporary native alarm SetAlarmActivity
                        // created -- safe even if it already fired, and needs to happen
                        // regardless of whether this import turns into a real Threshold
                        // alarm below.
                        if let Err(error) = handle
                            .alarm_manager()
                            .cancel(tauri_plugin_alarm_manager::CancelRequest { id: payload.id })
                        {
                            log::warn!(
                                "alarm-manager: failed to cancel temp native alarm for import {}: {error}",
                                payload.id
                            );
                        }

                        // A stale import means the one-shot occurrence already passed.
                        // Re-importing it now would silently turn a single alarm the user
                        // never asked to keep into an ongoing recurring one, so discard it.
                        if payload.trigger_at > 0
                            && chrono::Utc::now().timestamp_millis() >= payload.trigger_at
                        {
                            log::info!(
                                "alarm-manager: skipping stale import {} (past its occurrence)",
                                payload.id
                            );
                            return;
                        }

                        let Some(coord) = handle.try_state::<AlarmCoordinator>() else {
                            return;
                        };

                        // Held through the whole check-then-save sequence below so two
                        // imports racing each other (e.g. several queued while the app was
                        // cold, drained back-to-back on launch) can't both see "no
                        // duplicate" and both save -- mirrors the effectively-single-
                        // threaded guarantee the old TS loop got for free.
                        let Some(import_lock) = handle.try_state::<ImportLock>() else {
                            return;
                        };
                        let _import_guard = import_lock.0.lock().await;

                        let time_str = format!("{:02}:{:02}", payload.hour, payload.minute);

                        let known = match coord.get_all_alarms(&handle).await {
                            Ok(alarms) => alarms,
                            Err(error) => {
                                log::error!(
                                    "alarm-manager: failed to fetch known alarms for import {}: {error}",
                                    payload.id
                                );
                                return;
                            }
                        };

                        let duplicate = known.iter().any(|a| {
                            a.mode == alarm::AlarmMode::Fixed
                                && a.fixed_time.as_deref() == Some(time_str.as_str())
                                && a.label.as_deref() == Some(payload.label.as_str())
                        });

                        if duplicate {
                            log::info!("alarm-manager: skipping duplicate import {}", payload.id);
                            return;
                        }

                        let active_days = if !payload.active_days.is_empty() {
                            payload.active_days.clone()
                        } else {
                            // No requested days means "one-time" per the SET_ALARM
                            // contract; Threshold has no true one-shot concept, so fall
                            // back to the resolved occurrence's weekday.
                            use chrono::Datelike;
                            chrono::DateTime::from_timestamp_millis(payload.trigger_at)
                                .map(|dt| vec![dt.weekday().num_days_from_sunday() as i32])
                                .unwrap_or_else(|| vec![0])
                        };

                        let input = alarm::AlarmInput {
                            id: None,
                            label: Some(payload.label.clone()),
                            enabled: true,
                            mode: alarm::AlarmMode::Fixed,
                            fixed_time: Some(time_str),
                            window_start: None,
                            window_end: None,
                            active_days,
                            sound_uri: None,
                            sound_title: None,
                        };

                        match coord.save_alarm(&handle, input).await {
                            Ok(saved) => log::info!(
                                "alarm-manager: imported native alarm {} as Threshold alarm {}",
                                payload.id,
                                saved.id
                            ),
                            Err(error) => log::error!(
                                "alarm-manager: failed to save imported alarm {}: {error}",
                                payload.id
                            ),
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
