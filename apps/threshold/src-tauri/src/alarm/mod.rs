pub mod database;
pub mod events;
pub mod models;
pub mod scheduler;
pub mod error;

pub use models::*;
pub use error::{Error, Result};
use events::*;

use tauri::{AppHandle, Emitter, Runtime};
use database::AlarmDatabase;

/// Central coordinator for all alarm operations
pub struct AlarmCoordinator {
    db: AlarmDatabase,
}

impl AlarmCoordinator {
    /// Create a new coordinator.
    ///
    /// - `db`: backing alarm database for persistence and revisions.
    pub fn new(db: AlarmDatabase) -> Self {
        Self { db }
    }

    /// Get the phone's current revision number.
    pub async fn current_revision(&self) -> Result<i64> {
        self.db.current_revision().await
    }

    /// Get all alarms.
    ///
    /// - `_app`: app handle for event context (unused here).
    pub async fn get_all_alarms<R: Runtime>(
        &self,
        _app: &AppHandle<R>,
    ) -> Result<Vec<AlarmRecord>> {
        self.db.get_all().await
    }

    /// Get a single alarm by id.
    ///
    /// - `_app`: app handle for event context (unused here).
    /// - `id`: alarm identifier.
    pub async fn get_alarm<R: Runtime>(
        &self,
        _app: &AppHandle<R>,
        id: i32,
    ) -> Result<AlarmRecord> {
        self.db.get_by_id(id).await
    }

    /// Create or update an alarm and emit granular events.
    ///
    /// - `app`: app handle for event emission.
    /// - `input`: alarm payload to save.
    pub async fn save_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        input: AlarmInput,
    ) -> Result<AlarmRecord> {
        // Fetch previous state if updating (for event diffing)
        let is_new = input.id.is_none();
        let previous = if let Some(id) = input.id {
            self.db.get_by_id(id).await.ok()
        } else {
            None
        };

        // Calculate next trigger using scheduler
        let next_trigger = if input.enabled {
            scheduler::calculate_next_trigger(&input)?
        } else {
            None
        };

        // Get next revision
        let revision = self.db.next_revision().await?;

        // Save to database
        let alarm = self.db.save(input, next_trigger, revision).await?;

        // Emit events IN ORDER:

        // 1. CRUD event
        if is_new {
            self.emit_alarm_created(app, &alarm, revision).await?;
        } else {
            let snapshot = previous.as_ref().map(|p| AlarmSnapshot::from_alarm(p));
            self.emit_alarm_updated(app, &alarm, snapshot, revision).await?;
        }

        // 2. Scheduling events
        self.emit_scheduling_events(app, &alarm, previous.as_ref(), revision).await?;

        // 3. Batch event
        self.emit_batch_update(app, vec![alarm.id], revision).await?;

        Ok(alarm)
    }

    /// Toggle an alarm on or off via a full save path.
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: alarm identifier.
    /// - `enabled`: desired enabled state.
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

    /// Delete an alarm, create a tombstone, and emit deletion events.
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: alarm identifier.
    pub async fn delete_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
    ) -> Result<()> {
        let revision = self.db.next_revision().await?;

        // Get alarm info before delete (for label)
        let alarm = self.db.get_by_id(id).await.ok();

        self.db.delete_with_revision(id, revision).await?;

        // Emit events
        self.emit_alarm_deleted(app, id, alarm.as_ref().and_then(|a| a.label.clone()), revision).await?;
        self.emit_alarm_cancelled(app, id, CancelReason::Deleted, revision).await?;
        self.emit_batch_update(app, vec![id], revision).await?;

        Ok(())
    }

    /// Dismiss a ringing alarm and calculate the next occurrence.
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: alarm identifier.
    pub async fn dismiss_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
    ) -> Result<()> {
        let alarm = self.db.get_by_id(id).await?;

        // Emit dismissed event
        // Note: We need a revision for this event.
        // Technically dismiss changes state (next_trigger), so save_alarm will generate a revision.
        // But we want to emit 'dismissed' as a lifecycle event.
        // However, save_alarm will emit 'updated' + 'scheduled'/'cancelled'.

        // Let's rely on save_alarm for the state change events.
        // We can emit 'dismissed' here using the current revision or a new one?
        // Ideally lifecycle events also have revisions.
        // Let's grab the current revision for the dismissed event, as it relates to the *act* of dismissing.
        // Or better, save_alarm will produce a new revision.

        let dismissed_at = chrono::Utc::now().timestamp_millis();
        let fired_at = dismissed_at; // Approximation if not tracking exact fire time

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

        let new_alarm = self.save_alarm(app, input).await?;

        // Emit dismissed event
        let event = AlarmDismissed {
            id,
            fired_at,
            dismissed_at,
            next_trigger: new_alarm.next_trigger,
            revision: new_alarm.revision,
        };
        app.emit("alarm:dismissed", &event)?;

        Ok(())
    }

    /// Snooze a ringing alarm by setting the next trigger to an explicit timestamp.
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: alarm identifier.
    /// - `minutes`: snooze duration in minutes.
    pub async fn snooze_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
        minutes: i64,
    ) -> Result<()> {
        let alarm = self.db.get_by_id(id).await?;
        let now = chrono::Utc::now().timestamp_millis();
        let original_trigger = alarm.next_trigger.unwrap_or(now);
        let snoozed_until = now + minutes * 60 * 1000;

        let revision = self.db.next_revision().await?;
        let updated = self.db.update_next_trigger(id, Some(snoozed_until), revision).await?;

        let event = AlarmSnoozed {
            id,
            original_trigger,
            snoozed_until,
            revision,
        };
        app.emit("alarm:snoozed", &event)?;

        self.emit_scheduling_events(app, &updated, Some(&alarm), revision).await?;
        self.emit_batch_update(app, vec![id], revision).await?;

        Ok(())
    }

    /// Report that an alarm fired (lifecycle event only).
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: alarm identifier.
    /// - `actual_fired_at`: wall-clock firing time in epoch milliseconds.
    pub async fn report_alarm_fired<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
        actual_fired_at: i64,
    ) -> Result<()> {
        let alarm = self.db.get_by_id(id).await?;
        let revision = self.db.current_revision().await?;
        let trigger_at = alarm.next_trigger.unwrap_or(actual_fired_at);

        let event = AlarmFired {
            id,
            trigger_at,
            actual_fired_at,
            label: alarm.label.clone(),
            revision,
        };
        app.emit("alarm:fired", &event)?;

        Ok(())
    }

    /// Emit an explicit sync request (wear-sync).
    ///
    /// - `app`: app handle for event emission.
    /// - `reason`: sync trigger reason.
    pub async fn emit_sync_needed<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        reason: SyncReason,
    ) -> Result<()> {
        let revision = self.db.current_revision().await?;
        let alarms = self.db.get_all().await?;
        let all_alarms_json = serde_json::to_string(&alarms).ok();
        let event = AlarmsSyncNeeded { reason, revision, all_alarms_json };
        app.emit("alarms:sync:needed", &event)?;
        Ok(())
    }

    // =========================================================================
    // Maintenance & Recovery
    // =========================================================================

    /// Initialise the coordinator and heal any inconsistencies.
    ///
    /// - `app`: app handle for event emission.
    pub async fn heal_on_launch<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        log::info!("🔧 Starting heal-on-launch: syncing alarm-manager cache with DB");

        let alarms = self.get_all_alarms(app).await?;
        let enabled_count = alarms.iter()
            .filter(|a| a.enabled && a.next_trigger.is_some())
            .count();

        log::info!("Found {} enabled alarms, re-emitting scheduling events", enabled_count);

        for alarm in alarms {
            if alarm.enabled && alarm.next_trigger.is_some() {
                // Re-emit scheduling event to heal SharedPreferences cache
                // We use the alarm's *current* revision because we aren't changing it, just re-syncing
                self.emit_alarm_scheduled(app, &alarm, alarm.revision).await?;
            }
        }

        log::info!("✅ Heal-on-launch complete");
        Ok(())
    }

    /// Run periodic maintenance (tombstone cleanup).
    pub async fn run_maintenance(&self) -> Result<()> {
        // Keep tombstones for 30 days
        self.db.cleanup_tombstones_older_than_days(30).await?;
        Ok(())
    }

    // =========================================================================
    // Event Emission Helpers
    // =========================================================================

    /// Emit an alarm created event.
    ///
    /// - `app`: app handle for event emission.
    /// - `alarm`: alarm record to include.
    /// - `revision`: revision stamped on the mutation.
    async fn emit_alarm_created<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        alarm: &AlarmRecord,
        revision: i64,
    ) -> Result<()> {
        let event = AlarmCreated {
            alarm: alarm.clone(),
            revision,
        };
        app.emit("alarm:created", &event)?;
        Ok(())
    }

    /// Emit an alarm updated event with an optional snapshot.
    ///
    /// - `app`: app handle for event emission.
    /// - `alarm`: updated alarm record.
    /// - `previous`: optional snapshot of the prior state.
    /// - `revision`: revision stamped on the mutation.
    async fn emit_alarm_updated<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        alarm: &AlarmRecord,
        previous: Option<AlarmSnapshot>,
        revision: i64,
    ) -> Result<()> {
        let event = AlarmUpdated {
            alarm: alarm.clone(),
            previous,
            revision,
        };
        app.emit("alarm:updated", &event)?;
        Ok(())
    }

    /// Emit an alarm deleted event.
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: deleted alarm identifier.
    /// - `label`: optional label for UI display.
    /// - `revision`: revision stamped on the mutation.
    async fn emit_alarm_deleted<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
        label: Option<String>,
        revision: i64,
    ) -> Result<()> {
        let event = AlarmDeleted {
            id,
            label,
            revision,
        };
        app.emit("alarm:deleted", &event)?;
        Ok(())
    }

    /// Emit scheduling events based on the previous and next state.
    ///
    /// - `app`: app handle for event emission.
    /// - `alarm`: updated alarm record.
    /// - `previous`: prior alarm record (if any).
    /// - `revision`: revision stamped on the mutation.
    async fn emit_scheduling_events<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        alarm: &AlarmRecord,
        previous: Option<&AlarmRecord>,
        revision: i64,
    ) -> Result<()> {
        let was_scheduled = previous
            .map(|p| p.enabled && p.next_trigger.is_some())
            .unwrap_or(false);

        let should_schedule = alarm.enabled && alarm.next_trigger.is_some();

        match (was_scheduled, should_schedule) {
            (false, true) => {
                // Schedule
                self.emit_alarm_scheduled(app, alarm, revision).await?;
            },
            (true, false) => {
                // Cancel
                let reason = if alarm.enabled {
                    CancelReason::Updated
                } else {
                    CancelReason::Disabled
                };
                self.emit_alarm_cancelled(app, alarm.id, reason, revision).await?;
            },
            (true, true) => {
                // Check if trigger changed
                let trigger_changed = previous
                    .map(|p| p.next_trigger != alarm.next_trigger)
                    .unwrap_or(false);

                if trigger_changed {
                    self.emit_alarm_cancelled(app, alarm.id, CancelReason::Updated, revision).await?;
                    self.emit_alarm_scheduled(app, alarm, revision).await?;
                }
            },
            (false, false) => {},
        }

        Ok(())
    }

    /// Emit an alarm scheduled event.
    ///
    /// - `app`: app handle for event emission.
    /// - `alarm`: alarm record to schedule.
    /// - `revision`: revision stamped on the mutation.
    async fn emit_alarm_scheduled<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        alarm: &AlarmRecord,
        revision: i64,
    ) -> Result<()> {
        if let Some(trigger) = alarm.next_trigger {
            let event = AlarmScheduled {
                id: alarm.id,
                trigger_at: trigger,
                sound_uri: alarm.sound_uri.clone(),
                label: alarm.label.clone(),
                mode: alarm.mode.clone(),
                revision,
            };
            app.emit("alarm:scheduled", &event)?;
        }
        Ok(())
    }

    /// Emit an alarm cancelled event.
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: alarm identifier.
    /// - `reason`: cancellation reason.
    /// - `revision`: revision stamped on the mutation.
    async fn emit_alarm_cancelled<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
        reason: CancelReason,
        revision: i64,
    ) -> Result<()> {
        let event = AlarmCancelled {
            id,
            reason,
            revision,
        };
        app.emit("alarm:cancelled", &event)?;
        Ok(())
    }

    /// Emit a batch updated event for sync collectors.
    ///
    /// - `app`: app handle for event emission.
    /// - `updated_ids`: alarm ids included in this batch.
    /// - `revision`: revision stamped on the mutation.
    async fn emit_batch_update<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        updated_ids: Vec<i32>,
        revision: i64,
    ) -> Result<()> {
        let event = AlarmsBatchUpdated {
            updated_ids,
            revision,
            timestamp: chrono::Utc::now().timestamp_millis(),
        };
        app.emit("alarms:batch:updated", &event)?;
        Ok(())
    }
}
