// Android alarm manager bridge for schedule, cancel, and native alarm callbacks
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::models::*;
use serde::Serialize;
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
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
    #[cfg(not(target_os = "android"))]
    let handle = api.handle().clone();

    Ok(AlarmManager { handle })
}

/// Access to the alarm-manager APIs.
pub struct AlarmManager<R: Runtime> {
    handle: PluginHandle<R>,
}

impl<R: Runtime> AlarmManager<R> {
    pub fn schedule(&self, payload: ScheduleRequest) -> crate::Result<()> {
        self.invoke_schedule(payload)
    }

    pub fn cancel(&self, payload: CancelRequest) -> crate::Result<()> {
        self.invoke_cancel(payload)
    }

    pub fn pick_alarm_sound(
        &self,
        options: PickAlarmSoundOptions,
    ) -> crate::Result<PickedAlarmSound> {
        self.handle
            .run_mobile_plugin("pickAlarmSound", options)
            .map_err(Into::into)
    }

    pub fn stop_ringing(&self) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin("stopRinging", ())
            .map_err(Into::into)
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

    fn invoke_schedule(&self, payload: ScheduleRequest) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin("schedule", payload)
            .map_err(Into::into)
    }

    fn invoke_cancel(&self, payload: CancelRequest) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin("cancel", payload)
            .map_err(Into::into)
    }
}
