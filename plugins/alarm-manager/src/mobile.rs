use crate::models::*;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Manager, Runtime,
};

// Initialize the plugin
pub fn init<R: Runtime>(
    _app: &tauri::AppHandle<R>,
    api: PluginApi<R, ()>,
) -> crate::Result<AlarmManager<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.plugin.alarmmanager", "AlarmManagerPlugin")?;
    #[cfg(not(target_os = "android"))]
    let handle = api.handle().clone();

    Ok(AlarmManager {
        handle,
        scheduled_ids: Arc::new(Mutex::new(HashSet::new())),
    })
}

/// Access to the alarm-manager APIs.
pub struct AlarmManager<R: Runtime> {
    handle: PluginHandle<R>,
    scheduled_ids: Arc<Mutex<HashSet<i32>>>,
}

impl<R: Runtime> AlarmManager<R> {
    pub fn schedule(&self, payload: ScheduleRequest) -> crate::Result<()> {
        let id = payload.id;
        self.invoke_schedule(payload)?;
        self.scheduled_ids.lock().unwrap().insert(id);
        Ok(())
    }

    pub fn cancel(&self, payload: CancelRequest) -> crate::Result<()> {
        let id = payload.id;
        self.invoke_cancel(payload)?;
        self.scheduled_ids.lock().unwrap().remove(&id);
        Ok(())
    }

    pub fn get_launch_args(&self) -> crate::Result<Vec<ImportedAlarm>> {
        let payload: serde_json::Value = self
            .handle
            .run_mobile_plugin("get_launch_args", ())
            .map_err(crate::Error::from)?;

        // Compatibility: accept either direct array payloads or `{ value: [...] }`
        // wrapper objects from the Android plugin.
        let alarms_value = match payload {
            serde_json::Value::Array(_) => payload,
            serde_json::Value::Object(map) => map
                .get("value")
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![])),
            _ => serde_json::Value::Array(vec![]),
        };

        serde_json::from_value::<Vec<ImportedAlarm>>(alarms_value)
            .map_err(|error| crate::Error::MobilePlugin(format!(
                "failed to deserialize launch args payload: {error}"
            )))
    }

    pub fn pick_alarm_sound(
        &self,
        options: PickAlarmSoundOptions,
    ) -> crate::Result<PickedAlarmSound> {
        self.handle
            .run_mobile_plugin("pickAlarmSound", options)
            .map_err(Into::into)
    }

    pub fn check_active_alarm(&self) -> crate::Result<ActiveAlarmResponse> {
        self.handle
            .run_mobile_plugin("check_active_alarm", ())
            .map_err(Into::into)
    }

    pub fn stop_ringing(&self) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin("stop_ringing", ())
            .map_err(Into::into)
    }

    pub fn update_alarms(&self, alarms: Vec<Value>) {
        #[cfg(target_os = "android")]
        {
            let previous_ids = self.scheduled_ids.lock().unwrap().clone();
            let mut desired_ids = HashSet::new();

            for alarm in alarms {
                let id = alarm["id"].as_i64().unwrap_or(0) as i32;
                if id <= 0 {
                    continue;
                }

                let enabled = alarm["enabled"].as_bool().unwrap_or(false);
                let next_trigger = alarm["nextTrigger"].as_i64();
                let sound_uri = alarm["soundUri"].as_str().map(|s| s.to_string());

                if enabled {
                    if let Some(trigger) = next_trigger {
                        desired_ids.insert(id);
                        let payload = ScheduleRequest {
                            id,
                            trigger_at: trigger,
                            sound_uri,
                        };
                        if let Err(error) = self.invoke_schedule(payload) {
                            log::error!("Failed to schedule alarm {}: {}", id, error);
                        }
                    } else {
                        let payload = CancelRequest { id };
                        if let Err(error) = self.invoke_cancel(payload) {
                            log::error!("Failed to cancel alarm {}: {}", id, error);
                        }
                    }
                } else {
                    if previous_ids.contains(&id) {
                        let payload = CancelRequest { id };
                        if let Err(error) = self.invoke_cancel(payload) {
                            log::error!("Failed to cancel alarm {}: {}", id, error);
                        }
                    }
                }
            }

            for removed_id in previous_ids.difference(&desired_ids) {
                let payload = CancelRequest { id: *removed_id };
                if let Err(error) = self.invoke_cancel(payload) {
                    log::error!("Failed to cancel removed alarm {}: {}", removed_id, error);
                }
            }

            *self.scheduled_ids.lock().unwrap() = desired_ids;
        }
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

pub fn handle_alarms_changed<R: Runtime>(app: &AppHandle<R>, alarms: Vec<Value>) {
    let manager = app.state::<AlarmManager<R>>();
    manager.update_alarms(alarms);
}
