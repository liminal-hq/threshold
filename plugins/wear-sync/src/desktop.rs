// Desktop no-op stubs — allows the plugin to compile on non-Android targets
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::models::{PublishRequest, SyncRequest};
use tauri::{plugin::PluginApi, AppHandle, Runtime};

/// Initialise the desktop backend for the wear-sync plugin.
///
/// Desktop does not support Wear OS, so all methods are no-ops that
/// log the call for development visibility.
pub fn init<R: Runtime>(
    app: &AppHandle<R>,
    _api: PluginApi<R, ()>,
) -> crate::Result<WearSync<R>> {
    Ok(WearSync {
        app: app.clone(),
    })
}

/// Desktop stub for the Wear Data Layer bridge.
///
/// All methods succeed silently so the plugin can be registered on
/// desktop builds without feature-gating every call site.
pub struct WearSync<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> WearSync<R> {
    pub fn publish_to_watch(&self, _request: PublishRequest) -> crate::Result<()> {
        log::debug!("wear-sync: desktop stub — publish_to_watch (no-op)");
        Ok(())
    }

    pub fn request_sync_from_watch(&self, _request: SyncRequest) -> crate::Result<()> {
        log::debug!("wear-sync: desktop stub — request_sync_from_watch (no-op)");
        Ok(())
    }
}
