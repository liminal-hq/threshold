use crate::alarm::{AlarmCoordinator, AlarmInput, AlarmRecord};
use crate::alarm::events::SyncReason;
use tauri::{AppHandle, Runtime, State};

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
