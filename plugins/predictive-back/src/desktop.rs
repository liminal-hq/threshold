// Desktop stub -- predictive back is an Android-only gesture
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<PredictiveBack<R>> {
    Ok(PredictiveBack(app.clone()))
}

/// Access to the PredictiveBack APIs.
pub struct PredictiveBack<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> PredictiveBack<R> {
    pub fn set_can_go_back(&self, _can_go_back: bool) -> crate::Result<()> {
        // No-op on desktop -- there is no swipe-back gesture to intercept.
        Ok(())
    }
}
