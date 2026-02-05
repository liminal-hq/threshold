use crate::alarm::{AlarmCoordinator, AlarmInput, AlarmRecord};
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
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
