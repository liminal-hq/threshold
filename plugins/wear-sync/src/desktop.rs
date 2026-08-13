// Desktop no-op stubs — allows the plugin to compile on non-Android targets
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::models::{
    AlarmDismissRequest, AlarmRingRequest, AlarmSnoozeRequest, NativeFanOutEnabledResponse,
    PublishRequest, SyncRequest,
};
use tauri::{plugin::PluginApi, AppHandle, Runtime};

/// Initialise the desktop backend for the wear-sync plugin.
///
/// Desktop does not support Wear OS, so all methods are no-ops that
/// log the call for development visibility.
pub fn init<R: Runtime>(app: &AppHandle<R>, _api: PluginApi<R, ()>) -> crate::Result<WearSync<R>> {
    Ok(WearSync { _app: app.clone() })
}

/// Desktop stub for the Wear Data Layer bridge.
///
/// All methods succeed silently so the plugin can be registered on
/// desktop builds without feature-gating every call site.
pub struct WearSync<R: Runtime> {
    _app: AppHandle<R>,
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

    pub fn send_alarm_ring(&self, _request: AlarmRingRequest) -> crate::Result<()> {
        log::debug!("wear-sync: desktop stub — send_alarm_ring (no-op)");
        Ok(())
    }

    pub fn send_alarm_dismiss(&self, _request: AlarmDismissRequest) -> crate::Result<()> {
        log::debug!("wear-sync: desktop stub — send_alarm_dismiss (no-op)");
        Ok(())
    }

    pub fn send_alarm_snooze(&self, _request: AlarmSnoozeRequest) -> crate::Result<()> {
        log::debug!("wear-sync: desktop stub — send_alarm_snooze (no-op)");
        Ok(())
    }

    pub async fn request_watch_logs(&self) -> crate::Result<bool> {
        log::debug!("wear-sync: desktop stub — request_watch_logs (no-op)");
        Ok(false)
    }

    /// Desktop has no native (in-process, pre-Rust-boot) fan-out concept at all -- there's
    /// no cold-start gap to close in the first place, since the whole app is one process
    /// with no separate native plugin layer. Accepts and silently discards the toggle so
    /// the command still exists (and no-ops sensibly) on desktop rather than erroring.
    pub fn set_native_fan_out_enabled(&self, enabled: bool) -> crate::Result<()> {
        let _ = enabled;
        log::debug!("wear-sync: desktop stub — set_native_fan_out_enabled (no-op)");
        Ok(())
    }

    /// Always reports enabled on desktop -- see [Self::set_native_fan_out_enabled].
    pub fn get_native_fan_out_enabled(&self) -> crate::Result<NativeFanOutEnabledResponse> {
        log::debug!("wear-sync: desktop stub — get_native_fan_out_enabled (no-op)");
        Ok(NativeFanOutEnabledResponse { enabled: true })
    }
}
