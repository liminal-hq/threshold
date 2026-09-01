// Desktop stub for the home-widgets plugin, which has no desktop widget surface
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::NextAlarmSnapshot;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<HomeWidgets<R>> {
    Ok(HomeWidgets(app.clone()))
}

/// Access to the HomeWidgets APIs.
pub struct HomeWidgets<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> HomeWidgets<R> {
    pub fn update_widget_snapshot(&self, _snapshot: NextAlarmSnapshot) -> crate::Result<()> {
        // No-op on desktop -- there is no Android home-screen widget to update.
        Ok(())
    }
}
