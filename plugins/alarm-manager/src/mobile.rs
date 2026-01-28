use crate::models::*;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    Runtime, AppHandle,
};
use serde_json::Value;

// Initialize the plugin
pub fn init<R: Runtime>(
    _app: &tauri::AppHandle<R>,
    api: PluginApi<R, ()>,
) -> crate::Result<AlarmManager<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.plugin.alarmmanager", "AlarmManagerPlugin")?;
    #[cfg(not(target_os = "android"))]
    let handle = api.handle().clone();

    Ok(AlarmManager(handle))
}

/// Access to the alarm-manager APIs.
pub struct AlarmManager<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AlarmManager<R> {
    pub fn get_launch_args(&self) -> crate::Result<Vec<ImportedAlarm>> {
        self.0
            .run_mobile_plugin("get_launch_args", ())
            .map_err(Into::into)
    }

    pub fn pick_alarm_sound(
        &self,
        options: PickAlarmSoundOptions,
    ) -> crate::Result<PickedAlarmSound> {
        self.0
            .run_mobile_plugin("pickAlarmSound", options)
            .map_err(Into::into)
    }

    pub fn check_active_alarm(&self) -> crate::Result<ActiveAlarmResponse> {
        self.0
            .run_mobile_plugin("check_active_alarm", ())
            .map_err(Into::into)
    }

    pub fn stop_ringing(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("stop_ringing", ())
            .map_err(Into::into)
    }
}

pub fn handle_alarms_changed<R: Runtime>(app: &AppHandle<R>, alarms: Vec<Value>) {
    #[cfg(target_os = "android")]
    {
        for alarm in alarms {
            let id = alarm["id"].as_i64().unwrap_or(0) as i32;
            let enabled = alarm["enabled"].as_bool().unwrap_or(false);
            let next_trigger = alarm["nextTrigger"].as_i64();
            let sound_uri = alarm["soundUri"].as_str().map(|s| s.to_string());

            let app_handle = app.clone();

            if enabled && next_trigger.is_some() {
                let trigger = next_trigger.unwrap();
                let _ = app.run_on_main_thread(move || {
                     if let Err(e) = schedule_native_alarm(&app_handle, id, trigger, sound_uri) {
                         log::error!("Failed to schedule alarm {}: {}", id, e);
                     }
                });
            } else {
                let _ = app.run_on_main_thread(move || {
                    if let Err(e) = cancel_native_alarm(&app_handle, id) {
                        log::error!("Failed to cancel alarm {}: {}", id, e);
                    }
                });
            }
        }
    }
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
            "(Landroid/content/Context;IJLjava/lang/String;)V"
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
            ]
        )?;

        Ok(())
    }).map_err(|e| crate::Error::Runtime(e.to_string()))?;
    Ok(())
}

#[cfg(target_os = "android")]
fn cancel_native_alarm<R: Runtime>(app: &AppHandle<R>, id: i32) -> crate::Result<()> {
    use jni::objects::JValue;

    app.run_on_android_context(move |env, _, context| {
        let class = env.find_class("com/plugin/alarmmanager/AlarmUtils")?;

        let method = env.get_static_method_id(
            class,
            "cancelAlarm",
            "(Landroid/content/Context;I)V"
        )?;

        env.call_static_method_unchecked(
            class,
            method,
            jni::signature::ReturnType::Primitive(jni::signature::Primitive::Void),
            &[
                JValue::Object(context),
                JValue::Int(id),
            ]
        )?;
        Ok(())
    }).map_err(|e| crate::Error::Runtime(e.to_string()))?;
    Ok(())
}
