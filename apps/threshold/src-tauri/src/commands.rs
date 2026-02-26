// Tauri command handlers for alarm CRUD and settings operations
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::alarm::{AlarmCoordinator, AlarmInput, AlarmRecord};
use crate::alarm::events::SyncReason;
use crate::SnoozeLengthState;
use crate::TimeFormatState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

#[tauri::command]
/// Fetch all alarms for UI or sync snapshots.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
pub async fn get_alarms<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
) -> Result<Vec<AlarmRecord>, String> {
    coordinator
        .get_all_alarms(&app)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Fetch a single alarm for edit and detail views.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
/// - `id`: alarm identifier.
pub async fn get_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
) -> Result<AlarmRecord, String> {
    coordinator
        .get_alarm(&app, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Create or update an alarm and emit granular events.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
/// - `alarm`: alarm payload to save.
pub async fn save_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    alarm: AlarmInput,
) -> Result<AlarmRecord, String> {
    coordinator
        .save_alarm(&app, alarm)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Toggle an alarm on or off and emit scheduling + batch events.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
/// - `id`: alarm identifier.
/// - `enabled`: desired enabled state.
pub async fn toggle_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
    enabled: bool,
) -> Result<AlarmRecord, String> {
    coordinator
        .toggle_alarm(&app, id, enabled)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Delete an alarm, create a tombstone, and emit deletion events.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
/// - `id`: alarm identifier.
pub async fn delete_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
) -> Result<(), String> {
    coordinator
        .delete_alarm(&app, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Dismiss a ringing alarm, recalculate the next trigger, and emit lifecycle events.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
/// - `id`: alarm identifier.
pub async fn dismiss_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
) -> Result<(), String> {
    coordinator
        .dismiss_alarm(&app, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Snooze a ringing alarm and emit lifecycle events.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
/// - `id`: alarm identifier.
/// - `minutes`: snooze duration in minutes.
pub async fn snooze_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
    minutes: i64,
) -> Result<(), String> {
    coordinator
        .snooze_alarm(&app, id, minutes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Report a native alarm firing without mutating alarm state.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
/// - `id`: alarm identifier.
/// - `actual_fired_at`: wall-clock firing time in epoch milliseconds.
pub async fn report_alarm_fired<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
    actual_fired_at: i64,
) -> Result<(), String> {
    coordinator
        .report_alarm_fired(&app, id, actual_fired_at)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Emit an explicit sync request without mutating alarm state.
///
/// - `app`: app handle for command context.
/// - `coordinator`: alarm coordinator state.
/// - `reason`: sync trigger reason.
pub async fn request_alarm_sync<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    reason: SyncReason,
) -> Result<(), String> {
    coordinator
        .emit_sync_needed(&app, reason)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Send a test alarm ring event to the connected watch.
///
/// Emits a synthetic `alarm:fired` event with alarm ID 999 (test alarm)
/// so the wear-sync plugin sends the ring message to the watch.
pub async fn test_watch_ring<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    use crate::alarm::events::AlarmFired;

    let snooze = app
        .try_state::<SnoozeLengthState>()
        .map(|s| s.load(Ordering::Relaxed))
        .unwrap_or(10);

    let now = chrono::Utc::now().timestamp_millis();
    let event = AlarmFired {
        id: 999,
        trigger_at: now,
        actual_fired_at: now,
        label: Some("Test Watch Ring".to_string()),
        revision: 0,
        snooze_length_minutes: snooze,
        is_24_hour: app
            .try_state::<TimeFormatState>()
            .map(|s| s.load(Ordering::Relaxed))
            .unwrap_or(false),
    };
    app.emit("alarm:fired", &event).map_err(|e| e.to_string())
}

#[tauri::command]
/// Update the snooze duration stored in Rust state and trigger a wear sync.
///
/// Called by the frontend whenever the user changes the snooze length
/// in settings. The value is included in `alarm:fired` events and
/// synced to the watch via the DataItem so the snooze button shows
/// the correct duration.
pub async fn set_snooze_length<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    minutes: i32,
) -> Result<(), String> {
    if let Some(state) = app.try_state::<SnoozeLengthState>() {
        state.store(minutes, Ordering::Relaxed);
        log::info!("snooze length updated to {} minutes", minutes);
    }

    // Trigger a wear sync so the watch receives the updated snooze setting
    coordinator
        .emit_sync_needed(&app, SyncReason::ForceSync)
        .await
        .map_err(|e| e.to_string())
}
