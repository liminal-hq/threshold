// Android alarm manager bridge for schedule, cancel, and native alarm callbacks
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::models::*;
use serde::Serialize;
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    plugin::PluginApi,
    Emitter, Runtime,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AlarmEventHandler {
    handler: Channel,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnoozeEventHandler {
    handler: Channel,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DismissEventHandler {
    handler: Channel,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportEventHandler {
    handler: Channel,
}

// Initialize the plugin
pub fn init<R: Runtime>(
    app: &tauri::AppHandle<R>,
    api: PluginApi<R, ()>,
) -> crate::Result<AlarmManager<R>> {
    #[cfg(target_os = "android")]
    let handle = {
        let handle =
            api.register_android_plugin("com.plugin.alarmmanager", "AlarmManagerPlugin")?;
        let app_handle = app.clone();

        handle.run_mobile_plugin::<()>(
            "setAlarmEventHandler",
            AlarmEventHandler {
                handler: Channel::new(move |event| {
                    let payload = match event {
                        InvokeResponseBody::Json(payload) => {
                            serde_json::from_str::<NativeAlarmFiredPayload>(&payload).ok()
                        }
                        _ => None,
                    };

                    if let Some(payload) = payload {
                        log::info!(
                            "alarm-manager: native alarm fired id={} at {}",
                            payload.id,
                            payload.actual_fired_at
                        );
                        let _ = app_handle.emit("alarm-manager:native-fired", &payload);
                    } else {
                        log::warn!("alarm-manager: failed to parse native alarm fired payload");
                    }
                    Ok(())
                }),
            },
        )?;

        // Register a channel for snooze-from-notification events. The ringing service posts
        // ACTION_SNOOZE which Kotlin forwards here; we re-emit as a Tauri event so the TS layer
        // can compute the snoozed_until timestamp and invoke snooze_alarm.
        let snooze_app_handle = app.clone();
        handle.run_mobile_plugin::<()>(
            "setSnoozeEventHandler",
            SnoozeEventHandler {
                handler: Channel::new(move |event| {
                    let payload = match event {
                        InvokeResponseBody::Json(payload) => {
                            serde_json::from_str::<NativeSnoozeRequestedPayload>(&payload).ok()
                        }
                        _ => None,
                    };

                    if let Some(payload) = payload {
                        log::info!("alarm-manager: snooze requested id={}", payload.id);
                        let _ = snooze_app_handle.emit("alarm-manager:snooze-requested", &payload);
                    } else {
                        log::warn!("alarm-manager: failed to parse snooze requested payload");
                    }
                    Ok(())
                }),
            },
        )?;

        // Register a channel for dismiss-from-notification events. The ringing service
        // posts ACTION_DISMISS (with an ALARM_ID extra when the user tapped a real alarm's
        // notification) which Kotlin forwards here; we re-emit as a Tauri event so the TS
        // layer can invoke dismiss_alarm and recalculate the next occurrence.
        let dismiss_app_handle = app.clone();
        handle.run_mobile_plugin::<()>(
            "setDismissEventHandler",
            DismissEventHandler {
                handler: Channel::new(move |event| {
                    let payload = match event {
                        InvokeResponseBody::Json(payload) => {
                            serde_json::from_str::<NativeDismissRequestedPayload>(&payload).ok()
                        }
                        _ => None,
                    };

                    if let Some(payload) = payload {
                        log::info!("alarm-manager: dismiss requested id={}", payload.id);
                        let _ =
                            dismiss_app_handle.emit("alarm-manager:dismiss-requested", &payload);
                    } else {
                        log::warn!("alarm-manager: failed to parse dismiss requested payload");
                    }
                    Ok(())
                }),
            },
        )?;

        // Register a channel for native alarm imports (e.g. from Android's "Set Alarm"
        // intent, handled by SetAlarmActivity). That Activity can run with the main Tauri
        // process completely cold, so the payload may arrive queued rather than live --
        // either way it lands here as an ordinary event, same as the other three.
        let import_app_handle = app.clone();
        handle.run_mobile_plugin::<()>(
            "setImportEventHandler",
            ImportEventHandler {
                handler: Channel::new(move |event| {
                    let payload = match event {
                        InvokeResponseBody::Json(payload) => {
                            serde_json::from_str::<ImportedAlarm>(&payload).ok()
                        }
                        _ => None,
                    };

                    if let Some(payload) = payload {
                        log::info!("alarm-manager: import requested id={}", payload.id);
                        let _ = import_app_handle.emit("alarm-manager:import-requested", &payload);
                    } else {
                        log::warn!("alarm-manager: failed to parse import requested payload");
                    }
                    Ok(())
                }),
            },
        )?;

        handle
    };
    // iOS: no native plugin to register (deferred). `api` is otherwise unused here --
    // there is no `PluginApi::handle()` to fall back to (only `config()`/`app()`/`scope()`
    // exist), so there is nothing to store; every method below returns a "not implemented
    // on iOS" error instead of touching a handle that was never obtained.
    #[cfg(not(target_os = "android"))]
    let _ = api;

    Ok(AlarmManager {
        #[cfg(target_os = "android")]
        handle,
        #[cfg(not(target_os = "android"))]
        _marker: std::marker::PhantomData,
    })
}

/// Access to the alarm-manager APIs.
pub struct AlarmManager<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<R>,
}

#[cfg(not(target_os = "android"))]
fn not_implemented_on_ios() -> crate::Error {
    crate::Error::MobilePlugin("Not implemented on iOS".to_string())
}

impl<R: Runtime> AlarmManager<R> {
    pub fn schedule(&self, payload: ScheduleRequest) -> crate::Result<()> {
        self.invoke_schedule(payload)
    }

    pub fn cancel(&self, payload: CancelRequest) -> crate::Result<()> {
        self.invoke_cancel(payload)
    }

    /// Opens Android's system ringtone/sound picker and waits for the user's choice.
    ///
    /// Unlike the other methods on this type, this is an open-ended wait -- the
    /// picker dialog stays open until the user chooses something or backs out,
    /// which can take anywhere from under a second to minutes depending on how
    /// long they browse. `pick_alarm_sound` is called directly from an `async fn`
    /// Tauri command (`commands::pick_alarm_sound`) that the frontend awaits, so
    /// using the blocking `run_mobile_plugin` here would tie up a shared tokio
    /// runtime worker thread for the entire duration the picker is open,
    /// potentially stalling other concurrent IPC commands. `run_mobile_plugin_async`
    /// awaits instead of blocking, same rationale as `wear_sync::request_watch_logs`.
    pub async fn pick_alarm_sound(
        &self,
        #[cfg_attr(not(target_os = "android"), allow(unused_variables))]
        options: PickAlarmSoundOptions,
    ) -> crate::Result<PickedAlarmSound> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin_async("pickAlarmSound", options)
            .await
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    pub fn stop_ringing(&self) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin("stopRinging", ())
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    /// Whether Android will actually honour the ringing notification's full-screen intent.
    /// Always `true` on desktop/pre-API-34, where the concept doesn't apply.
    pub fn check_full_screen_intent_permission(&self) -> crate::Result<bool> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin::<PermissionStatus>("checkFullScreenIntentPermission", ())
            .map(|r| r.granted)
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    /// Opens the OS settings screen for the full-screen-intent special permission.
    pub fn open_full_screen_intent_settings(&self) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin("openFullScreenIntentSettings", ())
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    /// Whether Android will schedule this app's alarms exactly rather than silently degrading
    /// to an inexact window. Always `true` on desktop/pre-API-31.
    pub fn check_exact_alarm_permission(&self) -> crate::Result<bool> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin::<PermissionStatus>("checkExactAlarmPermission", ())
            .map(|r| r.granted)
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    /// Opens the OS settings screen for the exact-alarm-scheduling special permission.
    pub fn open_exact_alarm_settings(&self) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin("openExactAlarmSettings", ())
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    /// Whether this app is exempted from Doze/App Standby battery optimization. Always `true`
    /// on desktop, where the concept doesn't apply.
    pub fn check_battery_optimization_exemption(&self) -> crate::Result<bool> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin::<PermissionStatus>("checkBatteryOptimizationExemption", ())
            .map(|r| r.granted)
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    /// Opens the OS settings screen for the battery-optimization exemption request.
    pub fn open_battery_optimization_settings(&self) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin("openBatteryOptimizationSettings", ())
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    /// The alarm ID `AlarmRingingService` is currently ringing for, if any -- a fallback for
    /// the frontend to detect an active alarm outside the normal deep-link launch path.
    pub fn get_currently_ringing_alarm(&self) -> crate::Result<Option<i32>> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin::<CurrentlyRingingAlarm>("getCurrentlyRingingAlarm", ())
            .map(|r| r.id)
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    pub fn mark_alarm_pipeline_ready(&self) -> crate::Result<()> {
        #[cfg(not(target_os = "android"))]
        {
            log::debug!(
                "alarm-manager: mark_alarm_pipeline_ready no-op on non-Android mobile target"
            );
            return Ok(());
        }

        #[cfg(target_os = "android")]
        self.handle
            .run_mobile_plugin("markAlarmPipelineReady", ())
            .map_err(Into::into)
    }

    fn invoke_schedule(
        &self,
        #[cfg_attr(not(target_os = "android"), allow(unused_variables))] payload: ScheduleRequest,
    ) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin("schedule", payload)
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }

    fn invoke_cancel(
        &self,
        #[cfg_attr(not(target_os = "android"), allow(unused_variables))] payload: CancelRequest,
    ) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin("cancel", payload)
            .map_err(Into::into);

        #[cfg(not(target_os = "android"))]
        Err(not_implemented_on_ios())
    }
}
