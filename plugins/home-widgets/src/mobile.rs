// Android bridge forwarding next-alarm snapshots to the Kotlin plugin's widget renderer
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::{NextAlarmSnapshot, WidgetSnapshotPayload};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "ca.liminalhq.threshold.homewidgets";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<HomeWidgets<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "HomeWidgetsPlugin")?;

    // NOTE: iOS has no home-screen widget surface for Threshold today, matching the rest of the app's iOS-deferred plugins (e.g. predictive-back, os-prefs).
    #[cfg(target_os = "ios")]
    let _ = api;

    Ok(HomeWidgets {
        #[cfg(target_os = "android")]
        handle,
        #[cfg(target_os = "ios")]
        _marker: std::marker::PhantomData,
    })
}

/// Access to the HomeWidgets APIs.
pub struct HomeWidgets<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(target_os = "ios")]
    _marker: std::marker::PhantomData<R>,
}

impl<R: Runtime> HomeWidgets<R> {
    /// Forwards the latest next-alarm snapshot to the Kotlin plugin's `updateWidgetSnapshot` handler, flattening it into the widget's wire shape first.
    pub fn update_widget_snapshot(
        &self,
        #[cfg_attr(not(target_os = "android"), allow(unused_variables))]
        snapshot: NextAlarmSnapshot,
    ) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        {
            let payload: WidgetSnapshotPayload = snapshot.into();
            self.handle
                .run_mobile_plugin("updateWidgetSnapshot", payload)
                .map_err(Into::into)
        }

        #[cfg(not(target_os = "android"))]
        {
            log::debug!("home-widgets: update_widget_snapshot no-op on non-Android mobile target");
            Ok(())
        }
    }
}
