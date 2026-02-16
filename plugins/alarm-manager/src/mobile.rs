use crate::models::*;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
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
        self.handle
            .run_mobile_plugin("schedule", payload)
            .map_err(Into::into)?;
        self.scheduled_ids.lock().unwrap().insert(id);
        Ok(())
    }

    pub fn cancel(&self, payload: CancelRequest) -> crate::Result<()> {
        let id = payload.id;
        self.handle
            .run_mobile_plugin("cancel", payload)
            .map_err(Into::into)?;
        self.scheduled_ids.lock().unwrap().remove(&id);
        Ok(())
    }

    pub fn get_launch_args(&self) -> crate::Result<Vec<ImportedAlarm>> {
        self.handle
            .run_mobile_plugin("get_launch_args", ())
            .map_err(Into::into)
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

    pub fn update_alarms(&self, app: &AppHandle<R>, alarms: Vec<Value>) {
        #[cfg(target_os = "android")]
        {
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
                        schedule_on_main_thread(app, id, trigger, sound_uri);
                    } else {
                        cancel_on_main_thread(app, id);
                    }
                } else {
                    cancel_on_main_thread(app, id);
                }
            }

            let previous_ids = self.scheduled_ids.lock().unwrap().clone();
            for removed_id in previous_ids.difference(&desired_ids) {
                cancel_on_main_thread(app, *removed_id);
            }

            *self.scheduled_ids.lock().unwrap() = desired_ids;
        }
    }
}

pub fn handle_alarms_changed<R: Runtime>(app: &AppHandle<R>, alarms: Vec<Value>) {
    let manager = app.state::<AlarmManager<R>>();
    manager.update_alarms(app, alarms);
}

fn schedule_on_main_thread<R: Runtime>(
    app: &AppHandle<R>,
    id: i32,
    trigger_at: i64,
    sound_uri: Option<String>,
) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(error) = schedule_native_alarm(&app_handle, id, trigger_at, sound_uri) {
            log::error!("Failed to schedule alarm {}: {}", id, error);
        }
    });
}

fn cancel_on_main_thread<R: Runtime>(app: &AppHandle<R>, id: i32) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(error) = cancel_native_alarm(&app_handle, id) {
            log::error!("Failed to cancel alarm {}: {}", id, error);
        }
    });
}

#[cfg(target_os = "android")]
fn schedule_native_alarm<R: Runtime>(
    app: &AppHandle<R>,
    id: i32,
    trigger_at: i64,
    sound_uri: Option<String>,
) -> crate::Result<()> {
    use jni::objects::JValue;

    app.run_on_android_context(move |env, _, context| {
        let class = env.find_class("com/plugin/alarmmanager/AlarmUtils")?;

        let method = env.get_static_method_id(
            class,
            "scheduleAlarm",
            "(Landroid/content/Context;IJLjava/lang/String;)V",
        )?;

        let sound_uri_jstring = if let Some(s) = sound_uri {
            Some(env.new_string(s)?)
        } else {
            None
        };

        let sound_uri_obj = match &sound_uri_jstring {
            Some(s) => JValue::Object(s),
            None => JValue::Object(&jni::objects::JObject::null()),
        };

        env.call_static_method_unchecked(
            class,
            method,
            jni::signature::ReturnType::Primitive(jni::signature::Primitive::Void),
            &[
                JValue::Object(context),
                JValue::Int(id),
                JValue::Long(trigger_at),
                sound_uri_obj,
            ],
        )?;

        Ok(())
    })
    .map_err(|e| crate::Error::Runtime(e.to_string()))?;
    Ok(())
}

#[cfg(not(target_os = "android"))]
fn schedule_native_alarm<R: Runtime>(
    _app: &AppHandle<R>,
    _id: i32,
    _trigger_at: i64,
    _sound_uri: Option<String>,
) -> crate::Result<()> {
    Ok(())
}

#[cfg(target_os = "android")]
fn cancel_native_alarm<R: Runtime>(app: &AppHandle<R>, id: i32) -> crate::Result<()> {
    use jni::objects::JValue;

    app.run_on_android_context(move |env, _, context| {
        let class = env.find_class("com/plugin/alarmmanager/AlarmUtils")?;

        let method =
            env.get_static_method_id(class, "cancelAlarm", "(Landroid/content/Context;I)V")?;

        env.call_static_method_unchecked(
            class,
            method,
            jni::signature::ReturnType::Primitive(jni::signature::Primitive::Void),
            &[JValue::Object(context), JValue::Int(id)],
        )?;
        Ok(())
    })
    .map_err(|e| crate::Error::Runtime(e.to_string()))?;
    Ok(())
}

#[cfg(not(target_os = "android"))]
fn cancel_native_alarm<R: Runtime>(_app: &AppHandle<R>, _id: i32) -> crate::Result<()> {
    Ok(())
}
