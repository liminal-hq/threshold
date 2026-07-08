// Desktop stub for app-management operations
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<AppManagement<R>> {
    Ok(AppManagement(app.clone()))
}

/// Access to the app-management APIs.
pub struct AppManagement<R: Runtime>(AppHandle<R>);

impl<R: Runtime> AppManagement<R> {
    pub fn minimize_app(&self) -> crate::Result<()> {
        Ok(())
    }
}
