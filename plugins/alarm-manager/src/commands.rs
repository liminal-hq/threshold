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
pub async fn stop_ringing<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.alarm_manager().stop_ringing()
}

#[command]
pub async fn check_full_screen_intent_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<FullScreenIntentPermission> {
    let granted = app.alarm_manager().check_full_screen_intent_permission()?;
    Ok(FullScreenIntentPermission { granted })
}

#[command]
pub async fn open_full_screen_intent_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.alarm_manager().open_full_screen_intent_settings()
}

#[command]
pub async fn get_currently_ringing_alarm<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CurrentlyRingingAlarm> {
    let id = app.alarm_manager().get_currently_ringing_alarm()?;
    Ok(CurrentlyRingingAlarm { id })
}
