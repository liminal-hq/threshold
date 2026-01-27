pub mod database;
pub mod events;
pub mod models;
pub mod scheduler;
pub mod error;

pub use models::*;
pub use error::{Error, Result};

use tauri::{AppHandle, Emitter, Runtime};
use database::AlarmDatabase;

/// Central coordinator for all alarm operations
pub struct AlarmCoordinator {
    db: AlarmDatabase,
}

impl AlarmCoordinator {
    pub fn new(db: AlarmDatabase) -> Self {
        Self { db }
    }

    /// Get all alarms
    pub async fn get_all_alarms<R: Runtime>(
        &self,
        // app handle might be needed for db access if db wasn't self-contained,
        // but AlarmDatabase uses sqlx pool internally so it might not strictly need app handle for queries
        // assuming standard pattern where db methods take &self
        _app: &AppHandle<R>,
    ) -> Result<Vec<AlarmRecord>> {
        self.db.get_all().await
    }

    /// Get single alarm by ID
    pub async fn get_alarm<R: Runtime>(
        &self,
        _app: &AppHandle<R>,
        id: i32,
    ) -> Result<AlarmRecord> {
        self.db.get_by_id(id).await
    }

    /// Create or update alarm
    pub async fn save_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        input: AlarmInput,
    ) -> Result<AlarmRecord> {
        // Calculate next trigger using scheduler
        let next_trigger = if input.enabled {
            scheduler::calculate_next_trigger(&input)?
        } else {
            None
        };

        // Save to database
        let alarm = self.db.save(input, next_trigger).await?;

        // Emit event to all listeners
        self.emit_alarms_changed(app).await?;

        Ok(alarm)
    }

    /// Toggle alarm on/off
    pub async fn toggle_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
        enabled: bool,
    ) -> Result<AlarmRecord> {
        let alarm = self.db.get_by_id(id).await?;

        let input = AlarmInput {
            id: Some(alarm.id),
            label: alarm.label,
            enabled,
            mode: alarm.mode,
            fixed_time: alarm.fixed_time,
            window_start: alarm.window_start,
            window_end: alarm.window_end,
            active_days: alarm.active_days,
            sound_uri: alarm.sound_uri,
            sound_title: alarm.sound_title,
        };

        self.save_alarm(app, input).await
    }

    /// Delete alarm
    pub async fn delete_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
    ) -> Result<()> {
        self.db.delete(id).await?;
        self.emit_alarms_changed(app).await?;
        Ok(())
    }

    /// Dismiss ringing alarm and calculate next occurrence
    pub async fn dismiss_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
    ) -> Result<()> {
        let alarm = self.db.get_by_id(id).await?;

        // Recalculate next occurrence
        let input = AlarmInput {
            id: Some(alarm.id),
            label: alarm.label,
            enabled: alarm.enabled,
            mode: alarm.mode,
            fixed_time: alarm.fixed_time,
            window_start: alarm.window_start,
            window_end: alarm.window_end,
            active_days: alarm.active_days,
            sound_uri: alarm.sound_uri,
            sound_title: alarm.sound_title,
        };

        self.save_alarm(app, input).await?;
        Ok(())
    }

    /// Emit alarms:changed event
    async fn emit_alarms_changed<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let alarms = self.db.get_all().await?;
        app.emit("alarms:changed", &alarms)?;
        Ok(())
    }
}
