use tauri::{
  plugin::PluginApi,
  Runtime,
  Emitter,
};
use crate::models::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::task::JoinHandle;
use tokio::time::{sleep_until, Instant, Duration};

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
  pub fn schedule(&self, payload: ScheduleRequest) -> crate::Result<()> {
    let id = payload.id;
    let trigger_at = payload.trigger_at;
    
    println!("Desktop: Schedule alarm {} for {}", id, trigger_at);

    // Cancel existing alarm if any
    self.cancel(CancelRequest { id })?;

    let app_handle = self.app.clone();
    let tasks_map = self.tasks.clone();

    let task = tokio::spawn(async move {
        // Calculate duration until trigger
        // We use system time to calculate the duration, then tokio::time::Instant for the sleep
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

        // Cleanup task from map
        let mut map = tasks_map.lock().unwrap();
        map.remove(&id);
    });

    let mut map = self.tasks.lock().unwrap();
    map.insert(id, task);

    Ok(())
  }

  pub fn cancel(&self, payload: CancelRequest) -> crate::Result<()> {
    println!("Desktop: Cancel alarm {}", payload.id);
    let mut map = self.tasks.lock().unwrap();
    if let Some(task) = map.remove(&payload.id) {
        task.abort();
    }
    Ok(())
  }

  pub fn get_launch_args(&self) -> crate::Result<Vec<ImportedAlarm>> {
    // Desktop doesn't support launch args / intent imports like Android
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
