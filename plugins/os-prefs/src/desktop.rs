// Desktop stubs for OS preference queries
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::models::{AnimatorDurationScaleResponse, TimeFormatResponse};
use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<OsPrefs<R>> {
    Ok(OsPrefs(app.clone()))
}

/// Access to the OsPrefs APIs
pub struct OsPrefs<R: Runtime>(AppHandle<R>);

impl<R: Runtime> OsPrefs<R> {
    pub fn get_time_format(&self) -> crate::Result<TimeFormatResponse> {
        // Desktop implementation should theoretically not be reached if the frontend
        // handles the logic using Intl. But if called, we return a default.
        println!("OsPrefs (Desktop): get_time_format called, returning default false (12h)");
        Ok(TimeFormatResponse { is24_hour: false })
    }

    pub fn get_animator_duration_scale(&self) -> crate::Result<AnimatorDurationScaleResponse> {
        // No equivalent desktop setting wired up -- always full speed.
        Ok(AnimatorDurationScaleResponse { scale: 1.0 })
    }

    /// Not an Android concept; nothing to open.
    pub fn open_notification_settings(&self) -> crate::Result<()> {
        Ok(())
    }
}
