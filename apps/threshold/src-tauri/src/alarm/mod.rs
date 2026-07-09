// Coordinates alarm persistence, scheduling, and lifecycle event emission
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

pub mod database;
pub mod error;
pub mod events;
pub mod models;
pub mod scheduler;

pub use error::{Error, Result};
use events::*;
pub use models::*;

use database::AlarmDatabase;
use tauri::{AppHandle, Emitter, Manager, Runtime};

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
    pub async fn get_alarm<R: Runtime>(&self, _app: &AppHandle<R>, id: i32) -> Result<AlarmRecord> {
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
            let snapshot = previous.as_ref().map(AlarmSnapshot::from_alarm);
            self.emit_alarm_updated(app, &alarm, snapshot, revision)
                .await?;
        }

        // 2. Scheduling events
        self.emit_scheduling_events(app, &alarm, previous.as_ref(), revision)
            .await?;

        // 3. Batch event
        self.emit_batch_update(app, vec![alarm.id], revision)
            .await?;

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
            mode: alarm.mode.clone(),
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
    pub async fn delete_alarm<R: Runtime>(&self, app: &AppHandle<R>, id: i32) -> Result<()> {
        let revision = self.db.next_revision().await?;

        // Get alarm info before delete (for label)
        let alarm = self.db.get_by_id(id).await.ok();

        self.db.delete_with_revision(id, revision).await?;

        // Emit events
        self.emit_alarm_deleted(
            app,
            id,
            alarm.as_ref().and_then(|a| a.label.clone()),
            revision,
        )
        .await?;
        self.emit_alarm_cancelled(app, id, CancelReason::Deleted, revision)
            .await?;
        self.emit_batch_update(app, vec![id], revision).await?;

        Ok(())
    }

    /// Dismiss a ringing alarm and calculate the next occurrence.
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: alarm identifier.
    pub async fn dismiss_alarm<R: Runtime>(&self, app: &AppHandle<R>, id: i32) -> Result<()> {
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

        // Recalculate next occurrence after the current scheduled trigger so
        // dismissing an upcoming alarm skips this occurrence.
        let input = AlarmInput {
            id: Some(alarm.id),
            label: alarm.label.clone(),
            enabled: alarm.enabled,
            mode: alarm.mode.clone(),
            fixed_time: alarm.fixed_time.clone(),
            window_start: alarm.window_start.clone(),
            window_end: alarm.window_end.clone(),
            active_days: alarm.active_days.clone(),
            sound_uri: alarm.sound_uri.clone(),
            sound_title: alarm.sound_title.clone(),
        };

        let next_trigger = if input.enabled {
            let reference_ms = alarm
                .next_trigger
                .unwrap_or_else(|| chrono::Utc::now().timestamp_millis())
                + 1_000;
            scheduler::calculate_next_trigger_after(&input, reference_ms)?
        } else {
            None
        };

        let revision = self.db.next_revision().await?;
        let new_alarm = self.db.save(input, next_trigger, revision).await?;
        self.emit_alarm_updated(
            app,
            &new_alarm,
            Some(AlarmSnapshot::from_alarm(&alarm)),
            revision,
        )
        .await?;
        self.emit_scheduling_events(app, &new_alarm, Some(&alarm), revision)
            .await?;
        self.emit_batch_update(app, vec![id], revision).await?;

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
    /// - `snoozed_until`: absolute epoch-millisecond timestamp for the new trigger.
    ///   The TS layer is responsible for computing the anchor (now + N for ringing,
    ///   original_trigger + N for upcoming) and enforcing a minimum-in-future floor.
    pub async fn snooze_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
        snoozed_until: i64,
    ) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        if snoozed_until <= now {
            return Err(Error::Validation(
                "snoozed_until must be in the future".into(),
            ));
        }
        let alarm = self.db.get_by_id(id).await?;
        let original_trigger = alarm.next_trigger.unwrap_or(now);

        let revision = self.db.next_revision().await?;
        let updated = self
            .db
            .update_next_trigger(id, Some(snoozed_until), revision)
            .await?;

        let event = AlarmSnoozed {
            id,
            original_trigger,
            snoozed_until,
            revision,
        };
        app.emit("alarm:snoozed", &event)?;

        self.emit_scheduling_events(app, &updated, Some(&alarm), revision)
            .await?;
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
        use std::sync::atomic::Ordering;

        let alarm = self.db.get_by_id(id).await?;
        let revision = self.db.current_revision().await?;
        let trigger_at = alarm.next_trigger.unwrap_or(actual_fired_at);

        // Read snooze length from managed state (synced from frontend settings)
        let snooze = app
            .try_state::<crate::SnoozeLengthState>()
            .map(|s: tauri::State<'_, crate::SnoozeLengthState>| s.load(Ordering::Relaxed))
            .unwrap_or(10);
        let is_24_hour = app
            .try_state::<crate::TimeFormatState>()
            .map(|s: tauri::State<'_, crate::TimeFormatState>| s.load(Ordering::Relaxed))
            .unwrap_or(false);
        let is_24_hour_known = app
            .try_state::<crate::TimeFormatKnownState>()
            .map(|s: tauri::State<'_, crate::TimeFormatKnownState>| s.load(Ordering::Relaxed))
            .unwrap_or(false);

        let event = AlarmFired {
            id,
            trigger_at,
            actual_fired_at,
            label: alarm.label.clone(),
            revision,
            snooze_length_minutes: snooze,
            is_24_hour,
            is_24_hour_known,
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
        use std::sync::atomic::Ordering;

        let revision = self.db.current_revision().await?;
        let alarms = self.db.get_all().await?;
        let all_alarms_json = serde_json::to_string(&alarms).ok();

        let snooze = app
            .try_state::<crate::SnoozeLengthState>()
            .map(|s: tauri::State<'_, crate::SnoozeLengthState>| s.load(Ordering::Relaxed))
            .unwrap_or(10);
        let is_24_hour = app
            .try_state::<crate::TimeFormatState>()
            .map(|s: tauri::State<'_, crate::TimeFormatState>| s.load(Ordering::Relaxed))
            .unwrap_or(false);
        let is_24_hour_known = app
            .try_state::<crate::TimeFormatKnownState>()
            .map(|s: tauri::State<'_, crate::TimeFormatKnownState>| s.load(Ordering::Relaxed))
            .unwrap_or(false);

        let event = AlarmsSyncNeeded {
            reason,
            revision,
            all_alarms_json,
            snooze_length_minutes: snooze,
            is_24_hour,
            is_24_hour_known,
        };
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
        let enabled_count = alarms
            .iter()
            .filter(|a| a.enabled && a.next_trigger.is_some())
            .count();

        log::info!(
            "Found {} enabled alarms, re-emitting scheduling events",
            enabled_count
        );

        for alarm in alarms {
            if alarm.enabled && alarm.next_trigger.is_some() {
                // Re-emit scheduling event to heal SharedPreferences cache
                // We use the alarm's *current* revision because we aren't changing it, just re-syncing
                self.emit_alarm_scheduled(app, &alarm, alarm.revision)
                    .await?;
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
        match classify_scheduling_transition(previous, alarm) {
            SchedulingTransition::Schedule => {
                self.emit_alarm_scheduled(app, alarm, revision).await?;
            }
            SchedulingTransition::Cancel(reason) => {
                self.emit_alarm_cancelled(app, alarm.id, reason, revision)
                    .await?;
            }
            SchedulingTransition::Reschedule => {
                self.emit_alarm_cancelled(app, alarm.id, CancelReason::Updated, revision)
                    .await?;
                self.emit_alarm_scheduled(app, alarm, revision).await?;
            }
            SchedulingTransition::NoOp => {}
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

/// What, if anything, a mutation should do to an alarm's native schedule. Pulled out of
/// `emit_scheduling_events` as a pure function so it's testable without an `AppHandle`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SchedulingTransition {
    Schedule,
    Cancel(CancelReason),
    Reschedule,
    NoOp,
}

fn classify_scheduling_transition(
    previous: Option<&AlarmRecord>,
    alarm: &AlarmRecord,
) -> SchedulingTransition {
    let was_scheduled = previous
        .map(|p| p.enabled && p.next_trigger.is_some())
        .unwrap_or(false);

    let should_schedule = alarm.enabled && alarm.next_trigger.is_some();

    match (was_scheduled, should_schedule) {
        (false, true) => SchedulingTransition::Schedule,
        (true, false) => {
            let reason = if alarm.enabled {
                CancelReason::Updated
            } else {
                CancelReason::Disabled
            };
            SchedulingTransition::Cancel(reason)
        }
        (true, true) => {
            // Re-schedule on a trigger change, or a sound change alone -- the native
            // scheduler needs to know about the latter too, or an edited sound won't
            // take effect until some other change happens to trigger a reschedule.
            let needs_reschedule = previous
                .map(|p| p.next_trigger != alarm.next_trigger || p.sound_uri != alarm.sound_uri)
                .unwrap_or(false);

            if needs_reschedule {
                SchedulingTransition::Reschedule
            } else {
                SchedulingTransition::NoOp
            }
        }
        (false, false) => SchedulingTransition::NoOp,
    }
}

#[cfg(test)]
mod scheduling_transition_tests {
    use super::*;

    fn alarm(enabled: bool, next_trigger: Option<i64>, sound_uri: Option<&str>) -> AlarmRecord {
        AlarmRecord {
            id: 1,
            label: None,
            enabled,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".into()),
            window_start: None,
            window_end: None,
            active_days: vec![0, 1, 2, 3, 4, 5, 6],
            next_trigger,
            sound_uri: sound_uri.map(|s| s.to_string()),
            sound_title: None,
            revision: 1,
        }
    }

    #[test]
    fn schedules_a_newly_enabled_alarm() {
        let previous = alarm(false, None, None);
        let current = alarm(true, Some(1_000), None);

        assert_eq!(
            classify_scheduling_transition(Some(&previous), &current),
            SchedulingTransition::Schedule
        );
    }

    #[test]
    fn schedules_a_brand_new_alarm_with_no_previous_state() {
        let current = alarm(true, Some(1_000), None);

        assert_eq!(
            classify_scheduling_transition(None, &current),
            SchedulingTransition::Schedule
        );
    }

    #[test]
    fn cancels_as_disabled_when_the_user_toggles_off() {
        let previous = alarm(true, Some(1_000), None);
        let current = alarm(false, Some(1_000), None);

        assert_eq!(
            classify_scheduling_transition(Some(&previous), &current),
            SchedulingTransition::Cancel(CancelReason::Disabled)
        );
    }

    #[test]
    fn cancels_as_updated_when_still_enabled_but_no_longer_has_a_trigger() {
        let previous = alarm(true, Some(1_000), None);
        let current = alarm(true, None, None);

        assert_eq!(
            classify_scheduling_transition(Some(&previous), &current),
            SchedulingTransition::Cancel(CancelReason::Updated)
        );
    }

    #[test]
    fn reschedules_when_the_trigger_time_changes() {
        let previous = alarm(true, Some(1_000), None);
        let current = alarm(true, Some(2_000), None);

        assert_eq!(
            classify_scheduling_transition(Some(&previous), &current),
            SchedulingTransition::Reschedule
        );
    }

    #[test]
    fn reschedules_when_only_the_sound_changes() {
        let previous = alarm(true, Some(1_000), Some("a.mp3"));
        let current = alarm(true, Some(1_000), Some("b.mp3"));

        assert_eq!(
            classify_scheduling_transition(Some(&previous), &current),
            SchedulingTransition::Reschedule
        );
    }

    #[test]
    fn does_nothing_when_neither_trigger_nor_sound_changed() {
        let previous = alarm(true, Some(1_000), Some("a.mp3"));
        let current = alarm(true, Some(1_000), Some("a.mp3"));

        assert_eq!(
            classify_scheduling_transition(Some(&previous), &current),
            SchedulingTransition::NoOp
        );
    }

    #[test]
    fn does_nothing_for_an_alarm_that_was_never_and_still_is_not_scheduled() {
        let previous = alarm(false, None, None);
        let current = alarm(false, None, None);

        assert_eq!(
            classify_scheduling_transition(Some(&previous), &current),
            SchedulingTransition::NoOp
        );
    }
}
