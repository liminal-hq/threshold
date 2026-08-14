// Tauri command handlers exposed to the webview
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::models::*;
use crate::AlarmManagerExt;
use crate::Result;
use tauri::{command, AppHandle, Runtime};

#[command]
pub async fn cancel<R: Runtime>(app: AppHandle<R>, payload: CancelRequest) -> Result<()> {
    // TODO: Remove this shim once UI cancellation uses only event-driven updates.
    app.alarm_manager().cancel(payload)
}

#[command]
pub async fn pick_alarm_sound<R: Runtime>(
    app: AppHandle<R>,
    options: PickAlarmSoundOptions,
) -> Result<PickedAlarmSound> {
    app.alarm_manager().pick_alarm_sound(options).await
}

#[command]
pub async fn stop_ringing<R: Runtime>(app: AppHandle<R>, alarm_id: Option<i32>) -> Result<()> {
    // `alarm_id` lets the in-app "Stop Alarm" button thread a real id through -- see
    // StopRingingRequest's KDoc. `None` preserves the old, ID-less behaviour for callers that
    // don't (or, for in-app snooze, deliberately don't) know which alarm they're stopping.
    match alarm_id {
        Some(id) => app.alarm_manager().stop_ringing_for(id),
        None => app.alarm_manager().stop_ringing(),
    }
}

#[command]
pub async fn check_full_screen_intent_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PermissionStatus> {
    let granted = app.alarm_manager().check_full_screen_intent_permission()?;
    Ok(PermissionStatus { granted })
}

#[command]
pub async fn open_full_screen_intent_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.alarm_manager().open_full_screen_intent_settings()
}

#[command]
pub async fn check_exact_alarm_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PermissionStatus> {
    let granted = app.alarm_manager().check_exact_alarm_permission()?;
    Ok(PermissionStatus { granted })
}

#[command]
pub async fn open_exact_alarm_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.alarm_manager().open_exact_alarm_settings()
}

#[command]
pub async fn check_battery_optimization_exemption<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PermissionStatus> {
    let granted = app.alarm_manager().check_battery_optimization_exemption()?;
    Ok(PermissionStatus { granted })
}

#[command]
pub async fn open_battery_optimization_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.alarm_manager().open_battery_optimization_settings()
}

#[command]
pub async fn get_currently_ringing_alarm<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CurrentlyRingingAlarm> {
    let id = app.alarm_manager().get_currently_ringing_alarm()?;
    Ok(CurrentlyRingingAlarm { id })
}
