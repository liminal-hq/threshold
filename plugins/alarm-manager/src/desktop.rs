use tauri::{
  plugin::PluginApi,
  Runtime,
  Emitter,
  Manager,
  AppHandle,
};
use crate::models::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::task::JoinHandle;
use tokio::time::{sleep_until, Instant, Duration};
use serde_json::Value;

pub fn init<R: Runtime>(
  app: &tauri::AppHandle<R>,
  _api: PluginApi<R, ()>,
) -> crate::Result<AlarmManager<R>> {
  Ok(AlarmManager {
    app: app.clone(),
    tasks: Arc::new(Mutex::new(HashMap::new())),
  })
}

pub struct AlarmManager<R: Runtime> {
  app: tauri::AppHandle<R>,
  tasks: Arc<Mutex<HashMap<i32, JoinHandle<()>>>>,
}

impl<R: Runtime> AlarmManager<R> {
  pub fn update_alarms(&self, alarms: Vec<Value>) {
      for alarm in alarms {
        let id = alarm["id"].as_i64().unwrap_or(0) as i32;
        let enabled = alarm["enabled"].as_bool().unwrap_or(false);
        let next_trigger = alarm["nextTrigger"].as_i64();

        if enabled && next_trigger.is_some() {
            let trigger = next_trigger.unwrap();
            self.schedule_internal(id, trigger);
        } else {
            self.cancel_internal(id);
        }
      }
  }

  fn schedule_internal(&self, id: i32, trigger_at: i64) {
    println!("Desktop: Schedule alarm {} for {}", id, trigger_at);

    // Cancel existing
    self.cancel_internal(id);

    let app_handle = self.app.clone();
    let tasks_map = self.tasks.clone();

    let task = tokio::spawn(async move {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or(std::time::Duration::ZERO)
            .as_millis() as i64;

        let delay_ms = trigger_at - now;
        
        if delay_ms > 0 {
            println!("Desktop: Sleeping for {} ms", delay_ms);
            sleep_until(Instant::now() + Duration::from_millis(delay_ms as u64)).await;
        } else {
             println!("Desktop: Trigger time in past, firing immediately");
        }

        println!("Desktop: Alarm {} firing!", id);
        if let Err(e) = app_handle.emit("alarm-ring", RingEventPayload { id }) {
             eprintln!("Failed to emit alarm-ring event: {}", e);
        }

        // Cleanup
        let mut map = tasks_map.lock().unwrap();
        map.remove(&id);
    });

    let mut map = self.tasks.lock().unwrap();
    map.insert(id, task);
  }

  fn cancel_internal(&self, id: i32) {
    let mut map = self.tasks.lock().unwrap();
    if let Some(task) = map.remove(&id) {
        task.abort();
    }
  }

  pub fn get_launch_args(&self) -> crate::Result<Vec<ImportedAlarm>> {
    Ok(vec![])
  }

  pub fn pick_alarm_sound(&self, _options: PickAlarmSoundOptions) -> crate::Result<PickedAlarmSound> {
    Err(crate::Error::Runtime("Unsupported platform".into()))
  }

  pub fn check_active_alarm(&self) -> crate::Result<ActiveAlarmResponse> {
    Ok(ActiveAlarmResponse {
      is_alarm: false,
      alarm_id: None,
    })
  }
  pub fn stop_ringing(&self) -> crate::Result<()> {
    println!("Desktop: Stop ringing request received");
    Ok(())
  }
}

pub fn handle_alarms_changed<R: Runtime>(app: &AppHandle<R>, alarms: Vec<Value>) {
    let manager = app.state::<AlarmManager<R>>();
    manager.update_alarms(alarms);
}
