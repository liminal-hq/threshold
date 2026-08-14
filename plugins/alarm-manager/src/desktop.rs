// Desktop (non-native) alarm scheduling backend
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::models::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{plugin::PluginApi, Emitter, Runtime};
use tokio::task::JoinHandle;
use tokio::time::{sleep_until, Duration, Instant};

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
        self.schedule_internal(payload.id, payload.trigger_at);
        Ok(())
    }

    pub fn cancel(&self, payload: CancelRequest) -> crate::Result<()> {
        self.cancel_internal(payload.id);
        Ok(())
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

    pub async fn pick_alarm_sound(
        &self,
        _options: PickAlarmSoundOptions,
    ) -> crate::Result<PickedAlarmSound> {
        Err(crate::Error::Runtime("Unsupported platform".into()))
    }

    pub fn stop_ringing(&self) -> crate::Result<()> {
        println!("Desktop: Stop ringing request received");
        Ok(())
    }

    /// Desktop has no native `AlarmRingingService` to thread an id into -- the frontend closes
    /// its own ringing window directly. Kept alongside [`stop_ringing`](Self::stop_ringing) so
    /// `commands::stop_ringing` compiles identically on both platforms. See issue #255 Phase 4A.
    pub fn stop_ringing_for(&self, alarm_id: i32) -> crate::Result<()> {
        println!("Desktop: Stop ringing request received for alarm {alarm_id}");
        Ok(())
    }

    /// Not an Android concept; nothing to gate.
    pub fn check_full_screen_intent_permission(&self) -> crate::Result<bool> {
        Ok(true)
    }

    pub fn open_full_screen_intent_settings(&self) -> crate::Result<()> {
        Ok(())
    }

    /// Not an Android concept; nothing to gate.
    pub fn check_exact_alarm_permission(&self) -> crate::Result<bool> {
        Ok(true)
    }

    pub fn open_exact_alarm_settings(&self) -> crate::Result<()> {
        Ok(())
    }

    /// Not an Android concept; nothing to gate.
    pub fn check_battery_optimization_exemption(&self) -> crate::Result<bool> {
        Ok(true)
    }

    pub fn open_battery_optimization_settings(&self) -> crate::Result<()> {
        Ok(())
    }

    /// Desktop ringing already navigates the frontend directly via the `alarm-ring` event;
    /// there's no separate native ringing state to query.
    pub fn get_currently_ringing_alarm(&self) -> crate::Result<Option<i32>> {
        Ok(None)
    }
}
