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
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Minimum gap between two `dismiss_alarm` calls for the *same* alarm id before the
/// second is treated as a genuinely new request rather than a duplicate delivery of the
/// same underlying user action. Wide enough to absorb async plumbing latency between the
/// direct TS-invoked command and the native `alarm-manager:dismiss-requested` round trip
/// that Ringing.tsx's Dismiss button now *also* triggers for the same tap (issue #255
/// Phase 4A/4C), while being far shorter than any realistic gap between two genuinely
/// separate dismissals of the same repeating alarm (at minimum a day apart) or between a
/// legitimate "dismiss upcoming" notification action -- which fires up to roughly ten
/// minutes *before* the alarm rings, see `AlarmManagerService.dismissNextOccurrence` in
/// the TS layer -- and the alarm's original due time.
///
/// A time-window debounce checked against a monotonic clock is a deliberate,
/// short-term tradeoff, not the final design: the more correct fix is a shared
/// `event_id` threaded through *every* dismiss delivery path (today only the native
/// listeners in `lib.rs` carry one, reused via `EventDedup` for exact-match rather than
/// time-window dedup) -- but that requires changes to `Ringing.tsx` and
/// `AlarmManagerPlugin.kt`, already implemented in PR #301 before this gap was found, so
/// reopening that PR's scope wasn't worth it here. Tracked as a follow-up: issue #304.
const DISMISS_DEBOUNCE_WINDOW: Duration = Duration::from_millis(5_000);

/// Central coordinator for all alarm operations
pub struct AlarmCoordinator {
    db: AlarmDatabase,
    /// Per-alarm-id locks used by `dismiss_alarm` to serialize concurrent calls for the
    /// *same* alarm and to hold that alarm's last-successful-dismiss time (`None` if
    /// never dismissed this process), used to debounce duplicate near-simultaneous calls
    /// for the same underlying dismiss action (see `DISMISS_DEBOUNCE_WINDOW` and
    /// `dismiss_alarm`'s own doc comment).
    ///
    /// The outer `std::sync::Mutex` only ever guards a quick, synchronous
    /// get-or-create-and-sweep on this map (see `dismiss_lock_for`) -- it's never held
    /// across an `.await`. The real critical section is the *inner* per-id
    /// `tokio::sync::Mutex`, held for that alarm's entire `dismiss_alarm` call, so
    /// unrelated alarms' dismisses never block each other (unlike a single lock guarding
    /// every id) and a concurrent call for the *same* id can't slip past the duplicate
    /// check before the first one resolves.
    ///
    /// In-memory only, like `EventDedup`: this covers same-process double-delivery, not
    /// crash-and-restart redelivery (see `EventDedup`'s own doc comment for why that's a
    /// separate, deliberately unclosed gap). Bounded in size the same way: idle entries
    /// (not currently locked) whose last dismiss has aged out of the debounce window are
    /// opportunistically swept on every `dismiss_lock_for` call, so this doesn't grow
    /// forever the way a plain "every id ever dismissed" map would.
    dismiss_locks: std::sync::Mutex<HashMap<i32, Arc<tokio::sync::Mutex<Option<Instant>>>>>,
}

impl AlarmCoordinator {
    /// Create a new coordinator.
    ///
    /// - `db`: backing alarm database for persistence and revisions.
    pub fn new(db: AlarmDatabase) -> Self {
        Self {
            db,
            dismiss_locks: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Gets (creating if needed) the per-alarm-id lock `dismiss_alarm` uses to serialize
    /// calls for `id` and hold its last-dismissed marker.
    ///
    /// While already holding the outer map lock, opportunistically evicts *other* idle
    /// and expired entries -- `try_lock` fails immediately rather than blocking if an
    /// entry is currently held by an in-flight `dismiss_alarm` call elsewhere, so a busy
    /// entry is never evicted out from under it. `id`'s own entry is never evicted here.
    fn dismiss_lock_for(&self, id: i32) -> Arc<tokio::sync::Mutex<Option<Instant>>> {
        let mut locks = self
            .dismiss_locks
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let now = Instant::now();
        locks.retain(|&other_id, lock| {
            if other_id == id {
                return true;
            }
            match lock.try_lock() {
                // Busy elsewhere -- never evict.
                Err(_) => true,
                // Idle: keep only if it has a recent-enough marker; a stale or never-set
                // marker means nothing is relying on this exact lock object anymore.
                Ok(last_dismissed_at) => last_dismissed_at.is_some_and(|last| {
                    now.saturating_duration_since(last) < DISMISS_DEBOUNCE_WINDOW
                }),
            }
        });

        locks
            .entry(id)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(None)))
            .clone()
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
        let input = AlarmInput::from_record(&alarm, enabled);

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
    /// Idempotent: `dismiss_alarm` for the same underlying user action can legitimately
    /// arrive here twice in quick succession -- once via the direct TS `AlarmService.dismiss`
    /// command, and once via the native `alarm-manager:dismiss-requested` round trip (see
    /// `lib.rs`), with no shared `event_id` to dedup on (issue #255 Phase 4C). A second
    /// call for the same alarm within `DISMISS_DEBOUNCE_WINDOW` is treated as a replay of
    /// the first rather than a new request; see the constant's own doc comment for why
    /// this is time-based rather than derived from `next_trigger`.
    ///
    /// - `app`: app handle for event emission.
    /// - `id`: alarm identifier.
    pub async fn dismiss_alarm<R: Runtime>(&self, app: &AppHandle<R>, id: i32) -> Result<()> {
        // Held for this whole method: dismiss_alarm reads the alarm, decides whether to
        // advance it, then writes -- without a lock spanning that whole sequence, two
        // genuinely concurrent calls for the same id could both read pre-dismiss state
        // and both pass the duplicate check before either commits, reproducing the
        // double-advance bug this exists to prevent. Scoped to just this alarm's id (see
        // `dismiss_lock_for`), so a dismiss of a *different* alarm never blocks on this.
        let lock = self.dismiss_lock_for(id);
        let mut last_dismissed_at = lock.lock().await;

        let now = Instant::now();
        let alarm = self.db.get_by_id(id).await?;

        // Note on an earlier, reverted design: a heuristic based on "is next_trigger
        // already in the future" was tried here instead of a time-based debounce. It
        // can't distinguish a duplicate replay (an earlier call already advanced
        // next_trigger past this occurrence) from a legitimate *new* dismiss of a
        // still-upcoming occurrence -- which is exactly what the "dismiss upcoming
        // alarm" notification action does: it fires up to roughly ten minutes *before*
        // the alarm rings, while next_trigger is still in the future (see
        // `AlarmManagerService.dismissNextOccurrence` in the TS layer). That heuristic
        // silently no-opped legitimate early dismisses, leaving the alarm to ring
        // anyway. Time elapsed since this alarm's *last dismissal*, not the shape of its
        // schedule, is the signal that actually distinguishes "duplicate" from "new".
        let is_duplicate = is_duplicate_dismiss(*last_dismissed_at, now);

        let wall_clock_now = chrono::Utc::now().timestamp_millis();

        if is_duplicate {
            // Deliberately does nothing to the DB, the revision, or `last_dismissed_at`
            // -- see `DISMISS_DEBOUNCE_WINDOW`'s doc comment for why this call is being
            // treated as a replay of the one that just ran.
            //
            // We still re-emit `alarm:dismissed` so every dismiss source gets the same
            // confirmation (mirrors `alarm:snoozed`'s toast design -- see CLAUDE.md's
            // note on why AlarmManagerService listens for it unconditionally). This is
            // safe because every current `alarm:dismissed` consumer already tolerates a
            // duplicate: Ringing.tsx guards `closeRingingWindow` behind `isClosingRef`,
            // and wear-sync's mirror just re-sends an already-idempotent "stop ringing"
            // message to the watch. Deliberately NOT re-running
            // save/emit_alarm_updated/emit_scheduling_events/emit_batch_update here,
            // though -- nothing changed in the DB, and doing so would make
            // alarm-manager's `alarm:scheduled` listener needlessly re-arm the OS alarm.
            let event = AlarmDismissed {
                id,
                fired_at: wall_clock_now,
                dismissed_at: wall_clock_now,
                next_trigger: alarm.next_trigger,
                revision: alarm.revision,
            };
            app.emit("alarm:dismissed", &event)?;
            return Ok(());
        }

        let dismissed_at = wall_clock_now;
        let fired_at = dismissed_at; // Approximation if not tracking exact fire time

        // Recalculate next occurrence after the current scheduled trigger so
        // dismissing an upcoming alarm skips this occurrence.
        let input = AlarmInput::from_record(&alarm, alarm.enabled);

        let next_trigger = if input.enabled {
            let reference_ms = alarm.next_trigger.unwrap_or(wall_clock_now) + 1_000;
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

        // Marked only now, right before returning success -- everything above this
        // point is fallible (`?`-propagated) and returns early on error without ever
        // reaching this line. That's deliberate: a failed attempt must not poison the
        // debounce window, or a legitimate retry within it would see a stale-but-present
        // marker, get silently treated as a duplicate, and return `Ok(())` without ever
        // actually dismissing anything.
        *last_dismissed_at = Some(now);

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
    /// - `handled_natively`: side-effect tags a native listener already handled at publish
    ///   time (e.g. `"watch-ring"`), per issue #255's Phase 3 payload contract. Always
    ///   empty on desktop, which has no native bus.
    pub async fn report_alarm_fired<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
        actual_fired_at: i64,
        handled_natively: Vec<String>,
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
            handled_natively,
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

        let now = chrono::Utc::now().timestamp_millis();
        let alarms = self.get_all_alarms(app).await?;
        // An elapsed next_trigger means the alarm already fired and hasn't been advanced to
        // its next occurrence yet (that only happens once the user dismisses/snoozes it) --
        // re-emitting scheduling for it here would hand Kotlin a trigger time in the past,
        // and AlarmManager.setAlarmClock() fires immediately on a past trigger, causing the
        // alarm to ring a second time moments after the app cold-starts off its own firing.
        let due: Vec<_> = alarms
            .into_iter()
            .filter(|a| a.enabled && a.next_trigger.is_some_and(|t| t > now))
            .collect();

        log::info!(
            "Found {} enabled alarms, re-emitting scheduling events",
            due.len()
        );

        for alarm in due {
            // Re-emit scheduling event to heal SharedPreferences cache
            // We use the alarm's *current* revision because we aren't changing it, just re-syncing
            self.emit_alarm_scheduled(app, &alarm, alarm.revision)
                .await?;
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

/// Whether a `dismiss_alarm` call for an alarm at `now` should be treated as a duplicate
/// of an already-processed dismiss, given that alarm's last-recorded dismiss time (if
/// any). Pulled out of `dismiss_alarm` as a pure function (matching
/// `classify_scheduling_transition` below) so the debounce rule is directly
/// unit-testable without a database, lock, or `AppHandle`.
///
/// Deliberately time-based rather than derived from `next_trigger`: see
/// `DISMISS_DEBOUNCE_WINDOW`'s doc comment (and `dismiss_alarm`'s) for why a
/// next_trigger-shape heuristic can't distinguish a duplicate replay from a legitimate
/// early dismiss of a still-upcoming occurrence.
///
/// Deliberately built on `Instant` (a monotonic clock), not `chrono::Utc::now()`: this
/// debounce is purely an internal, in-memory, same-process mechanism with no need to
/// relate to wall-clock time at all, so a monotonic clock sidesteps backward-jump bugs
/// (NTP corrections, manual clock changes) entirely rather than special-casing them --
/// `now.saturating_sub(last)` on wall-clock millis would otherwise go negative and look
/// like a duplicate on *every* call until wall-clock time caught back up.
/// `Instant::saturating_duration_since` degrades safely even in the (for a monotonic
/// clock, essentially theoretical) case where `last` is somehow after `now`.
fn is_duplicate_dismiss(last_dismissed_at: Option<Instant>, now: Instant) -> bool {
    last_dismissed_at
        .is_some_and(|last| now.saturating_duration_since(last) < DISMISS_DEBOUNCE_WINDOW)
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

    #[test]
    fn does_nothing_for_a_brand_new_disabled_alarm_with_no_previous_state() {
        let current = alarm(false, None, None);

        assert_eq!(
            classify_scheduling_transition(None, &current),
            SchedulingTransition::NoOp
        );
    }
}

#[cfg(test)]
mod dismiss_idempotency_tests {
    use super::*;

    // -- Pure `is_duplicate_dismiss` coverage -------------------------------------------

    #[test]
    fn not_a_duplicate_when_never_dismissed_before() {
        assert!(!is_duplicate_dismiss(None, Instant::now()));
    }

    #[test]
    fn is_a_duplicate_within_the_debounce_window() {
        let last = Instant::now();
        let now = last + DISMISS_DEBOUNCE_WINDOW - Duration::from_millis(1);
        assert!(is_duplicate_dismiss(Some(last), now));
    }

    #[test]
    fn is_not_a_duplicate_at_exactly_the_window_boundary() {
        let last = Instant::now();
        let now = last + DISMISS_DEBOUNCE_WINDOW;
        assert!(!is_duplicate_dismiss(Some(last), now));
    }

    #[test]
    fn is_not_a_duplicate_well_outside_the_window() {
        let last = Instant::now();
        let now = last + DISMISS_DEBOUNCE_WINDOW + Duration::from_secs(60);
        assert!(!is_duplicate_dismiss(Some(last), now));
    }

    /// A backward *wall-clock* jump (NTP correction, manual clock change) can't affect
    /// this debounce at all now that it's built on `Instant` -- there's no dedicated
    /// regression test for that scenario because it's structurally moot, not because
    /// it's unhandled. This test instead covers the one related edge `Instant` doesn't
    /// rule out by construction: `saturating_duration_since` degrading safely if
    /// `last_dismissed_at` is somehow after `now` (which "monotonic" makes practically
    /// unreachable, but the function still shouldn't panic or misbehave if it happened).
    #[test]
    fn does_not_panic_if_the_recorded_instant_is_somehow_after_now() {
        let now = Instant::now();
        let later = now + Duration::from_secs(1);
        assert!(is_duplicate_dismiss(Some(later), now));
    }

    // -- Coordinator-level coverage ---------------------------------------------------
    //
    // These exercise the real `dismiss_alarm` async method against an in-memory
    // `AlarmDatabase` (see `AlarmDatabase::new_in_memory`, test-only) and a
    // `tauri::test::mock_app()` `AppHandle` (needed because `dismiss_alarm` emits
    // lifecycle events through it). Being inside `alarm::mod` itself, these tests can
    // reach `coord.db` and `coord.dismiss_lock_for` directly to set up fixtures no
    // public API exposes (e.g. an alarm whose `next_trigger` is already overdue, or a
    // synthetic "last dismissed" instant from days ago, without actually sleeping).

    async fn test_coordinator() -> AlarmCoordinator {
        let db = database::AlarmDatabase::new_in_memory()
            .await
            .expect("failed to create in-memory alarm database");
        AlarmCoordinator::new(db)
    }

    fn repeating_alarm_input() -> AlarmInput {
        AlarmInput {
            active_days: vec![0, 1, 2, 3, 4, 5, 6], // every day, so it never runs out
            ..AlarmInput::default()
        }
    }

    fn one_shot_alarm_input() -> AlarmInput {
        AlarmInput {
            active_days: vec![], // no active day ever matches -- exhausts after firing once
            ..AlarmInput::default()
        }
    }

    #[tokio::test]
    async fn a_normal_single_dismiss_advances_next_trigger_and_bumps_revision() {
        let coord = test_coordinator().await;
        let app = tauri::test::mock_app();
        let handle = app.handle();

        let now = chrono::Utc::now().timestamp_millis();
        let past_trigger = now - 60_000; // alarm "just fired" a minute ago

        let input = repeating_alarm_input();
        let rev1 = coord.db.next_revision().await.unwrap();
        let alarm = coord
            .db
            .save(input.clone(), Some(past_trigger), rev1)
            .await
            .unwrap();

        let expected_next = scheduler::calculate_next_trigger_after(
            &AlarmInput {
                id: Some(alarm.id),
                ..input
            },
            past_trigger + 1_000,
        )
        .unwrap();
        assert!(
            expected_next.is_some(),
            "a daily alarm always has a next occurrence"
        );

        coord.dismiss_alarm(handle, alarm.id).await.unwrap();

        let after = coord.db.get_by_id(alarm.id).await.unwrap();
        assert_eq!(after.next_trigger, expected_next);
        assert!(after.revision > rev1);
    }

    /// Regression coverage for the "dismiss upcoming alarm" notification action
    /// (`AlarmManagerService.dismissNextOccurrence` -> `AlarmService.dismiss`), which
    /// fires up to roughly ten minutes *before* the alarm rings -- while `next_trigger`
    /// is still in the future. An earlier, reverted version of this fix treated "trigger
    /// already in the future" as proof of an already-processed duplicate, which silently
    /// no-opped this legitimate early dismiss and let the alarm ring anyway. It must
    /// still advance past the dismissed occurrence like any other dismiss.
    #[tokio::test]
    async fn dismissing_an_upcoming_alarm_before_it_rings_still_skips_the_occurrence() {
        let coord = test_coordinator().await;
        let app = tauri::test::mock_app();
        let handle = app.handle();

        let now = chrono::Utc::now().timestamp_millis();
        let upcoming_trigger = now + 10 * 60 * 1_000; // rings in 10 minutes -- not due yet

        let input = repeating_alarm_input();
        let rev1 = coord.db.next_revision().await.unwrap();
        let alarm = coord
            .db
            .save(input.clone(), Some(upcoming_trigger), rev1)
            .await
            .unwrap();

        let expected_next = scheduler::calculate_next_trigger_after(
            &AlarmInput {
                id: Some(alarm.id),
                ..input
            },
            upcoming_trigger + 1_000,
        )
        .unwrap();

        coord.dismiss_alarm(handle, alarm.id).await.unwrap();

        let after = coord.db.get_by_id(alarm.id).await.unwrap();
        assert_eq!(after.next_trigger, expected_next);
        assert_ne!(
            after.next_trigger,
            Some(upcoming_trigger),
            "the dismissed (still-upcoming) occurrence must not remain scheduled"
        );
        assert!(after.revision > rev1);
    }

    #[tokio::test]
    async fn near_simultaneous_duplicate_dismiss_calls_do_not_double_advance() {
        let coord = test_coordinator().await;
        let app = tauri::test::mock_app();
        let handle = app.handle();

        let now = chrono::Utc::now().timestamp_millis();
        let past_trigger = now - 60_000;

        let input = repeating_alarm_input();
        let rev1 = coord.db.next_revision().await.unwrap();
        let alarm = coord
            .db
            .save(input.clone(), Some(past_trigger), rev1)
            .await
            .unwrap();

        // First dismiss: nothing recorded yet for this id, so this processes normally
        // and advances to the next occurrence -- exactly like a normal dismiss.
        coord.dismiss_alarm(handle, alarm.id).await.unwrap();
        let after_first = coord.db.get_by_id(alarm.id).await.unwrap();
        assert!(after_first.next_trigger.unwrap() > now);

        // What a second, buggy recompute would produce if it (wrongly) chained off the
        // already-advanced trigger from the first call -- i.e. skipped an occurrence.
        let would_be_skipped = scheduler::calculate_next_trigger_after(
            &AlarmInput {
                id: Some(alarm.id),
                ..input
            },
            after_first.next_trigger.unwrap() + 1_000,
        )
        .unwrap();
        assert_ne!(
            after_first.next_trigger, would_be_skipped,
            "test fixture sanity check: the skipped-ahead value must differ from the correct one"
        );

        // Second (duplicate) dismiss for the *same* underlying action, arriving well
        // within the debounce window (this test runs in a few microseconds) -- must be a
        // no-op replay: no further advance, no redundant revision bump.
        coord.dismiss_alarm(handle, alarm.id).await.unwrap();
        let after_second = coord.db.get_by_id(alarm.id).await.unwrap();

        assert_eq!(after_second.next_trigger, after_first.next_trigger);
        assert_ne!(after_second.next_trigger, would_be_skipped);
        assert_eq!(after_second.revision, after_first.revision);
    }

    /// Proves the lock (not just the debounce timestamp) actually closes the race: two
    /// genuinely concurrent calls -- polled together via `tokio::join!`, so their
    /// `.await` points interleave rather than running strictly one-after-the-other --
    /// must still result in exactly one advance, with the second seeing the first's
    /// freshly-recorded debounce entry once it acquires the lock rather than racing it
    /// to read pre-dismiss state.
    #[tokio::test]
    async fn concurrent_dismiss_calls_for_the_same_alarm_do_not_double_advance() {
        let coord = test_coordinator().await;
        let app = tauri::test::mock_app();
        let handle = app.handle();

        let now = chrono::Utc::now().timestamp_millis();
        let past_trigger = now - 60_000;

        let input = repeating_alarm_input();
        let rev1 = coord.db.next_revision().await.unwrap();
        let alarm = coord
            .db
            .save(input, Some(past_trigger), rev1)
            .await
            .unwrap();

        let (first, second) = tokio::join!(
            coord.dismiss_alarm(handle, alarm.id),
            coord.dismiss_alarm(handle, alarm.id),
        );
        first.unwrap();
        second.unwrap();

        let after = coord.db.get_by_id(alarm.id).await.unwrap();
        // Exactly one of the two calls actually wrote to the DB -- the revision moved
        // forward by one step, not two.
        assert_eq!(after.revision, rev1 + 1);
        assert!(after.next_trigger.unwrap() > now);
    }

    #[tokio::test]
    async fn dismissals_of_the_same_alarm_outside_the_debounce_window_are_not_deduped() {
        let coord = test_coordinator().await;
        let app = tauri::test::mock_app();
        let handle = app.handle();

        let now = chrono::Utc::now().timestamp_millis();
        let past_trigger = now - 60_000; // fired again, e.g. a week after a prior dismiss

        let input = repeating_alarm_input();
        let rev1 = coord.db.next_revision().await.unwrap();
        let alarm = coord
            .db
            .save(input.clone(), Some(past_trigger), rev1)
            .await
            .unwrap();

        // Simulate a genuinely separate, much earlier dismissal of this same alarm --
        // well outside the debounce window -- without actually sleeping in the test.
        {
            let lock = coord.dismiss_lock_for(alarm.id);
            let mut last_dismissed_at = lock.lock().await;
            *last_dismissed_at =
                Some(Instant::now() - DISMISS_DEBOUNCE_WINDOW - Duration::from_secs(60));
        }

        let expected_next = scheduler::calculate_next_trigger_after(
            &AlarmInput {
                id: Some(alarm.id),
                ..input
            },
            past_trigger + 1_000,
        )
        .unwrap();

        coord.dismiss_alarm(handle, alarm.id).await.unwrap();

        let after = coord.db.get_by_id(alarm.id).await.unwrap();
        assert_eq!(
            after.next_trigger, expected_next,
            "a dismissal outside the debounce window must process normally, not be treated as a duplicate"
        );
        assert!(after.revision > rev1);
    }

    /// Regression coverage for the debounce marker being recorded before (rather than
    /// after) the fallible work in an earlier version of this fix: if `dismiss_alarm`
    /// fails partway through, a retry within what would be the debounce window must get
    /// a fresh attempt, not be silently swallowed as a duplicate no-op that returns
    /// `Ok(())` without ever actually dismissing anything.
    #[tokio::test]
    async fn a_failed_dismiss_does_not_poison_the_debounce_window_for_a_retry() {
        let coord = test_coordinator().await;
        let app = tauri::test::mock_app();
        let handle = app.handle();

        let now = chrono::Utc::now().timestamp_millis();
        let past_trigger = now - 60_000;

        // A zero-length window makes `calculate_next_trigger_after` fail every time --
        // standing in for any transient failure partway through dismiss_alarm's fallible
        // section (recompute, DB write, event emission, ...).
        let input = AlarmInput {
            mode: AlarmMode::Window,
            fixed_time: None,
            window_start: Some("07:00".into()),
            window_end: Some("07:00".into()),
            ..AlarmInput::default()
        };
        let rev1 = coord.db.next_revision().await.unwrap();
        let alarm = coord
            .db
            .save(input, Some(past_trigger), rev1)
            .await
            .unwrap();

        let first = coord.dismiss_alarm(handle, alarm.id).await;
        assert!(
            first.is_err(),
            "test fixture sanity check: a zero-length window must fail to compute"
        );

        // A retry, still well within what would be the debounce window (this test runs
        // in microseconds), must get a fresh attempt and fail the same way -- not be
        // silently treated as a duplicate replay of the failed first call.
        let second = coord.dismiss_alarm(handle, alarm.id).await;
        assert!(
            second.is_err(),
            "a retry after a failed dismiss must not be treated as a duplicate replay"
        );

        // Neither attempt silently wrote to the DB.
        let after = coord.db.get_by_id(alarm.id).await.unwrap();
        assert_eq!(after.revision, rev1);
    }

    /// Direct coverage of `dismiss_lock_for`'s opportunistic sweep: an idle entry whose
    /// last dismiss has aged out of the debounce window is evicted, but a recent one and
    /// a currently-locked ("busy") one are both kept regardless.
    #[tokio::test]
    async fn dismiss_lock_for_evicts_idle_expired_entries_but_keeps_recent_and_busy_ones() {
        let coord = test_coordinator().await;

        let stale_id = 1;
        {
            let lock = coord.dismiss_lock_for(stale_id);
            let mut last_dismissed_at = lock.lock().await;
            *last_dismissed_at =
                Some(Instant::now() - DISMISS_DEBOUNCE_WINDOW - Duration::from_secs(60));
        }

        let recent_id = 2;
        {
            let lock = coord.dismiss_lock_for(recent_id);
            let mut last_dismissed_at = lock.lock().await;
            *last_dismissed_at = Some(Instant::now());
        }

        let busy_id = 3;
        let busy_lock = coord.dismiss_lock_for(busy_id);
        let _busy_guard = busy_lock.lock().await; // held for the rest of this test

        // Requesting a lock for an unrelated fourth id triggers the sweep.
        let _ = coord.dismiss_lock_for(4);

        let locks = coord.dismiss_locks.lock().unwrap();
        assert!(
            !locks.contains_key(&stale_id),
            "an idle, expired entry must be evicted"
        );
        assert!(
            locks.contains_key(&recent_id),
            "an idle, still-within-window entry must be kept"
        );
        assert!(
            locks.contains_key(&busy_id),
            "a currently-locked entry must never be evicted"
        );
    }

    #[tokio::test]
    async fn double_dismiss_on_a_one_shot_alarm_is_safe() {
        let coord = test_coordinator().await;
        let app = tauri::test::mock_app();
        let handle = app.handle();

        let now = chrono::Utc::now().timestamp_millis();
        let past_trigger = now - 60_000;

        let input = one_shot_alarm_input();
        let rev1 = coord.db.next_revision().await.unwrap();
        let alarm = coord
            .db
            .save(input, Some(past_trigger), rev1)
            .await
            .unwrap();
        assert!(alarm.enabled);

        coord.dismiss_alarm(handle, alarm.id).await.unwrap();
        let after_first = coord.db.get_by_id(alarm.id).await.unwrap();
        // A non-repeating alarm has no next occurrence -- `dismiss_alarm` never flips
        // `enabled` itself, so it stays true with a cleared trigger.
        assert_eq!(after_first.next_trigger, None);
        assert!(after_first.enabled);

        // Double-dismiss (well within the debounce window) must not error, re-enable
        // the alarm, or fabricate a schedule.
        let result = coord.dismiss_alarm(handle, alarm.id).await;
        assert!(result.is_ok());

        let after_second = coord.db.get_by_id(alarm.id).await.unwrap();
        assert_eq!(after_second.next_trigger, None);
        assert!(after_second.enabled);
    }
}
