# Threshold Event Architecture v2.0 — With Monotonic Revisions

**Version:** 2.0
**Status:** Design Complete - Implementation Not Started
**Last Updated:** February 1, 2026
**Current Branch:** `feat/wear-os-companion-support`

## Current Implementation Status

| Phase   | Component                 | Status         | Blocks      |
| ------- | ------------------------- | -------------- | ----------- |
| Phase 1 | Revision System           | ❌ Not Started | Milestone D |
| Phase 1 | Database Migration v2     | ❌ Not Started | Milestone D |
| Phase 2 | Event Structs (events.rs) | ❌ Not Started | Milestone D |
| Phase 2 | Event Emission            | ❌ Not Started | Milestone D |
| Phase 3 | alarm-manager Integration | ⏸️ Paused      | Phase 2     |
| Phase 4 | wear-sync Integration     | ⏸️ Paused      | Phase 2     |

**🔴 CRITICAL BLOCKER:** Milestone D (wear-sync plugin) cannot proceed without Phase 1-2 implementation.

**What Exists:**

- ✅ Rust alarm core (AlarmCoordinator, database, scheduler)
- ✅ Tauri commands (get_alarms, save_alarm, toggle_alarm, delete_alarm)
- ❌ events.rs is EMPTY (1 blank line)
- ❌ No revision tracking in database
- ❌ No granular event emission

**Tracked In:** GitHub Issue [#113](https://github.com/liminal-hq/threshold/issues/113)

---

## Executive Summary

This document defines Threshold's **Level 3 Granular Event System with Monotonic Revision Tracking** for bidirectional watch sync. It replaces the planned monolithic `alarms:changed` event with 11 semantic events across 4 categories.

**Key Capabilities:**

- ✅ **Bidirectional watch sync** (phone ↔ watch editing)
- ✅ **Incremental sync** (send only changes since last revision)
- ✅ **Conflict detection** (reject stale updates)
- ✅ **Optimistic UI updates** (instant feedback)
- ✅ **Efficient bandwidth** (80-220 bytes vs 1200 bytes per event)
- ✅ **No subscriber diffing** (plugins get exactly what they need)

**Current Implementation Status:**

- ✅ Milestone A: Rust alarm core complete (`apps/threshold/src-tauri/src/alarm/`)
- ❌ Revision system: Not yet added (next step)
- ❌ Event system: `events.rs` is empty (ready to implement)
- ❌ TypeScript migration: Not started (Milestone B)
- ⚠️ wear-sync plugin: Scaffolding exists, needs event integration (Milestone D)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Revision System Design](#revision-system-design)
3. [Event Taxonomy](#event-taxonomy)
4. [Event Definitions](#event-definitions)
5. [Emission Strategy](#emission-strategy)
6. [Sync Protocol](#sync-protocol)
7. [Native Event Bus (Android, Issue #255)](#native-event-bus-android-issue-255)
8. [Implementation Phases](#implementation-phases)
9. [Testing Strategy](#testing-strategy)

---

## Architecture Overview

### Current System (Milestone A)

```rust
// apps/threshold/src-tauri/src/alarm/
├── mod.rs           // AlarmCoordinator - CRUD operations
├── models.rs        // AlarmRecord, AlarmInput (NO revision field yet)
├── database.rs      // SQLite operations (NO revision table yet)
├── scheduler.rs     // Next trigger calculation (✅ complete)
├── events.rs        // EMPTY - ready to implement
├── error.rs         // Error types
└── commands.rs      // Tauri command handlers
```

**What Works Now:**

- Rust commands: `get_alarms`, `save_alarm`, `toggle_alarm`, `delete_alarm`
- Scheduler calculates `next_trigger` with window randomization
- SQLite stores alarms (without revisions)
- alarm-manager plugin exists (but doesn't listen to events yet)

**What's Missing:**

- ❌ Revision tracking (global counter + per-alarm stamps)
- ❌ Event emission (coordinator doesn't emit yet)
- ❌ Event structs (events.rs is empty)
- ❌ TypeScript doesn't use Rust commands yet (still uses DatabaseService)
- ❌ wear-sync plugin doesn't listen/publish yet

---

## Revision System Design

### Why Revisions Are Essential

**Use Case:** User edits alarm #5 on watch while phone is offline

```
Without revisions:
  Watch: alarm #5 → trigger = 8:00 AM
  Phone: alarm #5 → trigger = 9:00 AM
  Reconnect: ❌ Which wins? No way to know!

With revisions:
  Watch: alarm #5 rev 42 → trigger = 8:00 AM
  Phone: alarm #5 rev 43 → trigger = 9:00 AM
  Reconnect: ✅ Phone wins (higher revision)
```

### Database Schema

```sql
-- Step 1: Add global revision counter
CREATE TABLE IF NOT EXISTS state_revision (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Only one row ever
    current_revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO state_revision (id, current_revision) VALUES (1, 0);

-- Step 2: Add revision to alarms table
ALTER TABLE alarms ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

-- Step 3: Tombstones for deleted alarms (enables incremental sync)
CREATE TABLE IF NOT EXISTS alarm_tombstones (
    alarm_id INTEGER PRIMARY KEY,
    deleted_at_revision INTEGER NOT NULL,
    deleted_at_timestamp INTEGER NOT NULL,
    label TEXT  -- For UI display: "Deleted: Wake Up"
);

-- Step 4: Index for incremental sync queries
CREATE INDEX IF NOT EXISTS idx_alarms_revision ON alarms(revision);
CREATE INDEX IF NOT EXISTS idx_tombstones_revision ON alarm_tombstones(deleted_at_revision);
```

**Migration Notes:**

- This will be Migration v2 (v1 is the initial schema)
- Existing alarms get `revision = 1` on upgrade
- Global counter starts at 1 after migration

### Revision Operations

```rust
// apps/threshold/src-tauri/src/alarm/database.rs

impl AlarmDatabase {
    /// Atomically increment and return next revision
    pub async fn next_revision(&self) -> Result<i64> {
        let mut tx = self.pool.begin().await?;

        // Atomic increment
        sqlx::query("UPDATE state_revision SET current_revision = current_revision + 1 WHERE id = 1")
            .execute(&mut *tx)
            .await?;

        // Fetch new value
        let (rev,): (i64,) = sqlx::query_as(
            "SELECT current_revision FROM state_revision WHERE id = 1"
        )
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(rev)
    }

    /// Get current revision without incrementing
    pub async fn current_revision(&self) -> Result<i64> {
        let (rev,): (i64,) = sqlx::query_as(
            "SELECT current_revision FROM state_revision WHERE id = 1"
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(rev)
    }

    /// Save alarm with revision stamp
    pub async fn save(
        &self,
        input: AlarmInput,
        next_trigger: Option<i64>,
        revision: i64,  // ← Caller provides (from next_revision)
    ) -> Result<AlarmRecord> {
        let active_days_json = serde_json::to_string(&input.active_days)?;
        let mode_str = match input.mode {
            AlarmMode::Fixed => "FIXED",
            AlarmMode::Window => "WINDOW",
        };
        let enabled_int = if input.enabled { 1 } else { 0 };

        if let Some(id) = input.id {
            // Update existing - stamp with new revision
            sqlx::query(
                "UPDATE alarms SET
                    label=?, enabled=?, mode=?, fixed_time=?, window_start=?,
                    window_end=?, active_days=?, next_trigger=?, sound_uri=?, sound_title=?,
                    revision=?
                WHERE id=?"
            )
            .bind(input.label)
            .bind(enabled_int)
            .bind(mode_str)
            .bind(input.fixed_time)
            .bind(input.window_start)
            .bind(input.window_end)
            .bind(active_days_json)
            .bind(next_trigger)
            .bind(input.sound_uri)
            .bind(input.sound_title)
            .bind(revision)  // ← NEW
            .bind(id)
            .execute(&self.pool)
            .await?;

            self.get_by_id(id).await
        } else {
            // Insert new - stamp with revision
            let result = sqlx::query(
                "INSERT INTO alarms
                    (label, enabled, mode, fixed_time, window_start, window_end,
                     active_days, next_trigger, sound_uri, sound_title, revision)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(input.label)
            .bind(enabled_int)
            .bind(mode_str)
            .bind(input.fixed_time)
            .bind(input.window_start)
            .bind(input.window_end)
            .bind(active_days_json)
            .bind(next_trigger)
            .bind(input.sound_uri)
            .bind(input.sound_title)
            .bind(revision)  // ← NEW
            .execute(&self.pool)
            .await?;

            let id = result.last_insert_rowid() as i32;
            self.get_by_id(id).await
        }
    }

    /// Get alarms changed since revision (for incremental sync)
    pub async fn get_alarms_since_revision(&self, since: i64) -> Result<Vec<AlarmRecord>> {
        let rows = sqlx::query_as::<_, AlarmRow>(
            "SELECT * FROM alarms WHERE revision > ? ORDER BY id"
        )
        .bind(since)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Get deleted alarm IDs since revision (for incremental sync)
    pub async fn get_deleted_since_revision(&self, since: i64) -> Result<Vec<i32>> {
        let rows: Vec<(i32,)> = sqlx::query_as(
            "SELECT alarm_id FROM alarm_tombstones WHERE deleted_at_revision > ?"
        )
        .bind(since)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    /// Delete alarm and create tombstone
    pub async fn delete_with_revision(&self, id: i32, revision: i64) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        // Get label before deleting
        let label: Option<(Option<String>,)> = sqlx::query_as(
            "SELECT label FROM alarms WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;

        // Delete alarm
        sqlx::query("DELETE FROM alarms WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // Create tombstone
        sqlx::query(
            "INSERT INTO alarm_tombstones (alarm_id, deleted_at_revision, deleted_at_timestamp, label)
             VALUES (?, ?, ?, ?)"
        )
        .bind(id)
        .bind(revision)
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(label.and_then(|l| l.0))
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Clean up old tombstones (time-based retention: 30 days)
    ///
    /// **Why time-based, not sync-based?**
    /// If we delete tombstones after watch sync, a second watch or reset watch
    /// would request incremental sync but miss deletions → "zombie" alarms.
    ///
    /// With 30-day retention:
    /// - Fresh watch syncs within 30 days: Gets all deletions ✓
    /// - Watch syncs after 30 days: Falls back to full sync (safe) ✓
    pub async fn cleanup_tombstones_older_than_days(&self, days: i64) -> Result<()> {
        let cutoff_timestamp = chrono::Utc::now()
            .checked_sub_signed(chrono::Duration::days(days))
            .unwrap()
            .timestamp_millis();

        sqlx::query("DELETE FROM alarm_tombstones WHERE deleted_at_timestamp < ?")
            .bind(cutoff_timestamp)
            .execute(&self.pool)
            .await?;

        Ok(())
    }
}
```

### Updated Models

```rust
// apps/threshold/src-tauri/src/alarm/models.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmRecord {
    pub id: i32,
    pub label: Option<String>,
    pub enabled: bool,
    pub mode: AlarmMode,
    pub fixed_time: Option<String>,
    pub window_start: Option<String>,
    pub window_end: Option<String>,
    pub active_days: Vec<i32>,
    pub next_trigger: Option<i64>,
    pub sound_uri: Option<String>,
    pub sound_title: Option<String>,
    pub revision: i64,  // ← ADD THIS
}

// AlarmInput stays the same (no revision - it's assigned by coordinator)
```

---

## Event Taxonomy

### Overview

```
Event System (11 events across 5 categories)
├── CRUD Events (3) ─────────── UI updates, wear-sync state
│   ├── alarm:created
│   ├── alarm:updated
│   └── alarm:deleted
│
├── Scheduling Events (2) ───── alarm-manager actions
│   ├── alarm:scheduled
│   └── alarm:cancelled
│
├── Lifecycle Events (3) ────── Analytics, toasts, history
│   ├── alarm:fired
│   ├── alarm:dismissed
│   └── alarm:snoozed
│
├── Batch Events (2) ────────── Sync optimization
│   ├── alarms:batch:updated
│   └── alarms:sync:needed
│
└── Widget Events (1) ───────── Home-screen widget updates
    └── alarm:next-changed
```

### Event Flow Example (Create Alarm)

```
User taps "Save" on EditAlarm screen
   ↓
1. UI calls: invoke('save_alarm', { alarm: input })
   ↓
2. Rust AlarmCoordinator:
   - revision = next_revision() → 43
   - alarm = db.save(input, next_trigger, revision)
   ↓
3. Emit events (in order):
   a) alarm:created { alarm, revision: 43 }
   b) alarm:scheduled { id, triggerAt, soundUri, revision: 43 }
   c) alarm:next-changed { alarm, is24Hour, theme } (only if the app-wide next alarm changed)
   d) alarms:batch:updated { updatedIds: [7], revision: 43 }
   ↓
4. Subscribers react:
   - UI: Add alarm to local store (instant)
   - alarm-manager: Schedule native alarm
   - wear-sync: Buffer for batch sync
   ↓
5. After 500ms debounce:
   - wear-sync: Fetch all alarms, publish to Data Layer
   ↓
6. Watch receives update within 2 seconds
```

---

## Event Definitions

### CRUD Events

#### 1. alarm:created

**Purpose:** New alarm added

**Payload:**

```rust
// apps/threshold/src-tauri/src/alarm/events.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmCreated {
    pub alarm: AlarmRecord,
    pub revision: i64,
}
```

**Example JSON:**

```json
{
	"alarm": {
		"id": 7,
		"label": "Morning Yoga",
		"enabled": true,
		"mode": "FIXED",
		"fixedTime": "06:30",
		"activeDays": [1, 2, 3, 4, 5],
		"nextTrigger": 1737885420000,
		"soundUri": "content://media/28",
		"soundTitle": "Argon",
		"revision": 43
	},
	"revision": 43
}
```

**Subscribers:**

- UI: Add to alarm list
- wear-sync: Buffer for batch
- alarm-manager: Ignores (waits for `alarm:scheduled`)

---

#### 2. alarm:updated

**Purpose:** Existing alarm modified

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmUpdated {
    pub alarm: AlarmRecord,
    pub previous: Option<AlarmSnapshot>,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmSnapshot {
    pub id: i32,
    pub enabled: bool,
    pub next_trigger: Option<i64>,
    pub revision: i64,
}
```

**Example:**

```json
{
	"alarm": {
		"id": 5,
		"enabled": false,
		"revision": 44
	},
	"previous": {
		"id": 5,
		"enabled": true,
		"nextTrigger": 1737885420000,
		"revision": 42
	},
	"revision": 44
}
```

---

#### 3. alarm:deleted

**Purpose:** Alarm removed

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmDeleted {
    pub id: i32,
    pub label: Option<String>,
    pub revision: i64,
}
```

**Example:**

```json
{
	"id": 3,
	"label": "Weekend Alarm",
	"revision": 45
}
```

---

### Scheduling Events

#### 4. alarm:scheduled

**Purpose:** Alarm registered with native AlarmManager

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmScheduled {
    pub id: i32,
    pub trigger_at: i64,
    pub sound_uri: Option<String>,
    pub label: Option<String>,
    pub mode: AlarmMode,
    pub revision: i64,
}
```

**alarm-manager Behavior:**

```rust
// plugins/alarm-manager/src/lib.rs

app.listen("alarm:scheduled", move |event| {
    let payload: AlarmScheduled = serde_json::from_str(event.payload()).unwrap();

    #[cfg(target_os = "android")]
    {
        schedule_native_alarm(
            payload.id,
            payload.trigger_at,
            payload.sound_uri,
        );

        // Save to SharedPreferences for boot recovery
        save_to_prefs(payload.id, payload.trigger_at, payload.sound_uri);
    }
});
```

**Why This Is Better:**

- ✅ No diffing logic needed
- ✅ Payload: 80 bytes (vs 1200 bytes for full Vec<AlarmRecord>)
- ✅ Clear semantic meaning
- ✅ Revision enables deduplication

---

#### 5. alarm:cancelled

**Purpose:** Alarm unregistered from AlarmManager

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmCancelled {
    pub id: i32,
    pub reason: CancelReason,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CancelReason {
    Disabled,   // User toggled off
    Deleted,    // User deleted alarm
    Updated,    // Rescheduling with new trigger
    Expired,    // One-time alarm fired
}
```

---

### Lifecycle Events

#### 6. alarm:fired

**Purpose:** Native alarm triggered

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmFired {
    pub id: i32,
    pub trigger_at: i64,
    pub actual_fired_at: i64,
    pub label: Option<String>,
    pub revision: i64,
}
```

---

#### 7. alarm:dismissed

**Purpose:** User stopped ringing alarm

**Triggered from four sources, all funnelling through `AlarmCoordinator::dismiss_alarm`:**
the native `AlarmRingingService` Dismiss action (`alarm-manager:dismiss-requested`,
handled directly in `lib.rs`), the watch (`wear:alarm:dismiss`, also handled directly
in `lib.rs`), the upcoming-notification Dismiss action (TS-invoked), and the in-app
Ringing screen's own Dismiss button (TS-invoked).

> **Issue #255 Phase 4A/4C note:** since Phase 4A, the in-app Ringing screen's Dismiss button no longer maps to exactly one of the four sources above -- it now fires _two_ of them together. `Ringing.tsx`'s `handleDismiss` threads the real alarm id into `AlarmManagerService.stopRinging(alarmId)`, so the native `AlarmRingingService` Dismiss action path (`alarm-manager:dismiss-requested`) now also carries a real id and fires (closing a prior gap where in-app dismiss produced no native dismiss event at all), in addition to the pre-existing direct `AlarmService.dismiss(id)` TS-invoked call. This relies on `dismiss_alarm` being safe to call twice in a row for the same alarm id -- Phase 4C made that true: a per-alarm-id lock held across the whole read-decide-write-emit sequence, a time-based debounce (not derived from `next_trigger`, since that heuristic broke the legitimate "dismiss upcoming alarm" early-notification case), a monotonic clock, and a debounce marker recorded only after success so a failed attempt can't poison a legitimate retry. In-app **snooze** deliberately does _not_ thread an id through `stopRinging` for the same reason (it would misattribute a snooze as a dismiss), so it isn't affected by this either way.

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmDismissed {
    pub id: i32,
    pub fired_at: i64,
    pub dismissed_at: i64,
    pub next_trigger: Option<i64>,
    pub revision: i64,
}
```

---

#### 8. alarm:snoozed

**Purpose:** User snoozed a ringing (or upcoming) alarm

**Triggered from four sources, all funnelling through `AlarmCoordinator::snooze_alarm`:**
the native `AlarmRingingService` Snooze action (`alarm-manager:snooze-requested`,
handled directly in `lib.rs`), the watch (`wear:alarm:snooze`, also handled directly
in `lib.rs`), the upcoming-notification Snooze action (TS-invoked), and the in-app
Ringing screen's own Snooze button (TS-invoked). The TS layer computes
`snoozed_until` for the two TS-invoked paths; the two native paths compute it in
Rust from `SnoozeLengthState`, Rust's own synced copy of the snooze-length setting.

`AlarmManagerService` listens for this event unconditionally (not tied to any one
call site) to publish the snooze confirmation toast, so every source above gets the
same confirmation.

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmSnoozed {
    pub id: i32,
    pub original_trigger: i64,
    pub snoozed_until: i64,
    pub revision: i64,
}
```

---

### Batch Events (Critical for Sync)

#### 9. alarms:batch:updated

**Purpose:** Multiple alarms changed (with revision seal)

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmsBatchUpdated {
    pub updated_ids: Vec<i32>,
    pub revision: i64,  // ← THE SAFETY SEAL
    pub timestamp: i64,
}
```

**Example:**

```json
{
	"updatedIds": [7, 12],
	"revision": 43,
	"timestamp": 1737885420000
}
```

**Why This Event Exists:**

- Enables debouncing (buffer 5 rapid edits → 1 sync)
- Carries revision for cheap sync checks
- wear-sync subscribes to THIS, not individual CRUD events

---

#### 10. alarms:sync:needed

**Purpose:** Explicit sync trigger

**Payload:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmsSyncNeeded {
    pub reason: SyncReason,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncReason {
    BatchComplete,  // Debounce timer expired
    Initialize,     // App startup
    Reconnect,      // Watch reconnected
    ForceSync,      // User requested
}
```

---

### Widget Events

#### 11. alarm:next-changed

**Purpose:** The app-wide next alarm (earliest `next_trigger` among enabled alarms) changed. Drives the Android home-screen widget via the home-widgets plugin.

**Payload:**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextAlarm {
    pub id: i32,
    pub label: Option<String>,
    pub trigger_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetThemePalette {
    pub fill: String,
    pub stroke: String,
    pub rail: String,
    pub eyebrow: String,
    pub time: String,
    pub label: String,
    pub rail_muted: String,
    pub text_muted: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetThemePalettes {
    pub light: WidgetThemePalette,
    pub dark: WidgetThemePalette,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmNextChanged {
    pub alarm: Option<NextAlarm>,
    pub is_24_hour: Option<bool>,
    pub theme: Option<WidgetThemePalettes>,
}
```

**Example:**

```json
{
	"alarm": { "id": 3, "label": "Weekday Alarm", "triggerAt": 1755500040000 },
	"is24Hour": true,
	"theme": {
		"light": { "fill": "#ffffff", "stroke": "#dfe5ee", "rail": "#002244", "eyebrow": "#b7541e", "time": "#1a1a1a", "label": "#5a6a80", "railMuted": "#aab4c2", "textMuted": "#5a6a80" },
		"dark": { "fill": "#2a364b", "stroke": "#3e5272", "rail": "#4c8dff", "eyebrow": "#ff8f5d", "time": "#f5f8ff", "label": "#a9bad1", "railMuted": "#3b4c66", "textMuted": "#7f90a8" }
	}
}
```

`alarm` is `null` when no enabled alarm has a trigger. `is24Hour` is `null` until the frontend has told Rust the phone's time format preference at least once.

`theme` follows the same TS-owned-setting pattern as `is24Hour`: the frontend computes both the light and dark widget palettes for the active theme (static theme, or Material You/system with a wallpaper response) on every theme application, contrast-corrects the eight roles against the fill colour, and pushes them via the `set_widget_theme` command, which Rust stores in `WidgetThemeState` and relays here unchanged.

`theme` is `null` only when nothing has been pushed yet (e.g. the seed emission at startup before the webview has applied a theme) -- consumers must keep their last stored palette in that case rather than treating `null` as "clear the widget's theme".

**Why This Event Exists:**

- Gives the home-widgets plugin a single source of truth for "what should the widget show" without re-deriving it from `alarms:batch:updated` on every subscriber
- Emitted only when the computed value actually changes, so a widget redraw isn't triggered by unrelated alarm edits (e.g. renaming a disabled alarm)
- Carries `is24Hour` so the widget can format the trigger time without a second round-trip to settings

---

## Emission Strategy

### Coordinator Integration

```rust
// apps/threshold/src-tauri/src/alarm/mod.rs

impl AlarmCoordinator {
    /// Initialize coordinator and heal any inconsistencies
    ///
    /// **Critical: Prevents Boot Recovery Split Brain**
    ///
    /// Race condition: Rust saves to SQLite, then event → plugin → SharedPreferences.
    /// If app crashes between these steps, SharedPreferences becomes stale.
    /// On boot, BootReceiver schedules wrong alarms.
    ///
    /// Solution: Every launch, re-emit all enabled alarms to force cache refresh.
    /// This makes the system self-healing - SharedPreferences eventually consistent.
    ///
    /// Performance: ~35ms for 5 alarms, ~115ms for 20 alarms (negligible)
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
                log::debug!("Healing alarm {}: trigger={}", alarm.id, alarm.next_trigger.unwrap());
                self.emit_alarm_scheduled(app, &alarm, alarm.revision).await?;
            }
        }

        log::info!("✅ Heal-on-launch complete: {} alarms synchronized", enabled_count);
        Ok(())
    }

    /// Run periodic maintenance (tombstone cleanup)
    pub async fn run_maintenance(&self) -> Result<()> {
        // Keep tombstones for 30 days (prevents zombie alarms on reset watches)
        self.db.cleanup_tombstones_older_than_days(30).await?;
        Ok(())
    }

    pub async fn save_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        input: AlarmInput,
    ) -> Result<AlarmRecord> {
        let is_new = input.id.is_none();
        let previous = if !is_new {
            Some(self.db.get_by_id(input.id.unwrap()).await?)
        } else {
            None
        };

        // Calculate trigger
        let next_trigger = if input.enabled {
            scheduler::calculate_next_trigger(&input)?
        } else {
            None
        };

        // ⭐ Get next revision BEFORE save
        let revision = self.db.next_revision().await?;

        // Save with revision
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

    // Helper methods

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
```

---

## Sync Protocol

### Phone ↔ Watch Handshake

```rust
// plugins/wear-sync/src/commands.rs

#[derive(Deserialize)]
struct SyncRequest {
    last_known_revision: i64,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum SyncResponse {
    UpToDate {
        current_revision: i64,
    },
    Incremental {
        current_revision: i64,
        alarms: Vec<AlarmRecord>,
        deleted_ids: Vec<i32>,
    },
    FullSync {
        current_revision: i64,
        alarms: Vec<AlarmRecord>,
    },
}

#[tauri::command]
pub async fn sync_from_watch<R: Runtime>(
    app: AppHandle<R>,
    request: SyncRequest,
) -> Result<SyncResponse, String> {
    let coordinator = app.state::<AlarmCoordinator>();

    let current_rev = coordinator.db.current_revision().await
        .map_err(|e| e.to_string())?;
    let watch_rev = request.last_known_revision;

    // Case 1: Up to date
    if watch_rev == current_rev {
        return Ok(SyncResponse::UpToDate {
            current_revision: current_rev
        });
    }

    // Case 2: Watch ahead (phone was reset)
    if watch_rev > current_rev {
        log::warn!("Watch ahead: watch={}, phone={}", watch_rev, current_rev);
        let alarms = coordinator.get_all_alarms(&app).await
            .map_err(|e| e.to_string())?;
        return Ok(SyncResponse::FullSync {
            current_revision: current_rev,
            alarms,
        });
    }

    // Case 3: Small gap - incremental
    let gap = current_rev - watch_rev;
    if gap <= 100 {
        let changed = coordinator.db.get_alarms_since_revision(watch_rev).await
            .map_err(|e| e.to_string())?;
        let deleted = coordinator.db.get_deleted_since_revision(watch_rev).await
            .map_err(|e| e.to_string())?;

        return Ok(SyncResponse::Incremental {
            current_revision: current_rev,
            alarms: changed,
            deleted_ids: deleted,
        });
    }

    // Case 4: Large gap - full sync
    let alarms = coordinator.get_all_alarms(&app).await
        .map_err(|e| e.to_string())?;
    Ok(SyncResponse::FullSync {
        current_revision: current_rev,
        alarms,
    })
}
```

### Watch → Phone Updates

```rust
#[tauri::command]
pub async fn save_alarm_from_watch<R: Runtime>(
    app: AppHandle<R>,
    alarm: AlarmInput,
    watch_revision: i64,
) -> Result<AlarmRecord, String> {
    let coordinator = app.state::<AlarmCoordinator>();

    // Check if watch data is stale
    if let Some(id) = alarm.id {
        if let Ok(existing) = coordinator.db.get_by_id(id).await {
            if existing.revision > watch_revision {
                log::warn!(
                    "Rejecting stale watch update: alarm {} watch_rev={} current_rev={}",
                    id, watch_revision, existing.revision
                );
                return Err("Stale revision - please sync first".into());
            }
        }
    }

    // Proceed with save (gets new revision)
    coordinator.save_alarm(&app, alarm).await
        .map_err(|e| e.to_string())
}
```

---

## Native Event Bus (Android, Issue #255)

> **Status: Implemented.** Unlike most of the rest of this document, which was written ahead of implementation and tracks a still-evolving plan, this section documents Android code that is actually built and merged (`plugins/native-bus/`, plus the Kotlin/Rust it wires into `alarm-manager` and `wear-sync`). It is the canonical write-up of the channel-bridge pattern flagged as a documentation gap by issue #209 and the `docs/audits/2026-07-07-repo-audit.md` "Ideas" list — `plugins/native-bus` is the tiny shared Kotlin helper that audit asked for, extracted out of the copy-pasted queue/drain logic that `WearSyncQueue` and `AlarmManagerPlugin`'s four legacy per-type queues had each grown independently.

Every event on this page so far is a **Tauri event**: it only exists once Rust has emitted it, which means it only exists once the Rust runtime has booted. On Android that boot can lag a cold process start by up to ~20 seconds, which is exactly the gap that used to leave the watch silent when an alarm fired while the phone was in active use (issue #254): the phone's own `AlarmReceiver` ran instantly (it's a plain `BroadcastReceiver`), but nothing could tell the watch to ring until Rust caught up.

`plugins/native-bus` exists to close gaps like that one: it lets native Android plugin code talk to _other native Android plugin code_, in-process, without waiting for Rust or the WebView. It has two independent pieces, both under `plugins/native-bus/android/src/main/java/ca/liminalhq/threshold/nativebus/`:

- **`NativeEventBus`** — a process-wide singleton pub/sub bus for the _instant_ fan-out path (e.g. alarm-manager telling wear-sync "an alarm just fired" the moment it happens).
- **`DurableEventQueue`** — a generic, reusable "persist until Rust is up, then drain" log that each plugin instantiates for itself, for the _durable, guaranteed-delivery_ path to Rust.

These are deliberately separate mechanisms with different guarantees, not two APIs for the same thing: `NativeEventBus.publish()` is fire-and-forget best-effort (an event with no listener, or a listener that hasn't registered yet, is simply dropped), while `DurableEventQueue` is what actually gets an event to Rust reliably, however long Rust takes to boot. A single logical event (e.g. "alarm fired") typically travels down **both** planes at once — see [The fired -> watch-ring flow](#the-fired---watch-ring-flow) below.

### NativeEventBus

`NativeEventBus` (`NativeEventBus.kt`) is a Kotlin `object` — one instance per process, shared automatically by every plugin that imports it, with no explicit wiring needed beyond depending on the `native-bus` Gradle module. `subscribe(topic, listener)` registers a `(payload: String) -> String?` callback; `publish(topic, payload)` invokes every listener registered for that topic, in registration order, and returns the set of non-null tags they returned.

**Threading contract** (from `NativeEventBus.kt`'s own KDoc, the authoritative source):

- `publish()` runs **synchronously, on the calling thread**. It does not post to a background thread, call `goAsync()`, or spawn a coroutine of its own — a caller that needs any of that (most notably a `BroadcastReceiver`) must arrange it itself around the call to `publish()`.
- This matters concretely for the bus's first real caller, `AlarmReceiver.onReceive()`: it runs on the main thread, and Android enforces a short ANR budget on broadcast delivery. A listener that blocks inside `publish()` — touching disk, calling into Play Services, any I/O at all — eats directly into that budget on every subscriber's behalf and can freeze or ANR the whole app.
- Every listener registered on the bus must therefore: do only cheap, non-blocking work inline (inspect the payload, decide what to do); hand any blocking work off to its own single-threaded executor or coroutine scope and return immediately, _not_ block waiting for it; and treat a non-null return value ("a tag") as "accepted for async handling", never as "the work is complete" — `publish()` only reports which listeners took ownership of the event, nothing about whether that work has finished.
- **Failure isolation:** each listener runs inside its own `try`/`catch`. A listener that throws is logged and skipped; it cannot block delivery to the other listeners on the same topic, and the exception never reaches `publish()`'s caller.

### Topic table

| Topic                             | Payload key for the alarm id | Published by                                                                                                                                   | Subscribed by                                                                                                                                                               |
| --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alarm-manager:native-fired`      | `id`                         | `AlarmReceiver` (alarm-manager), always, the instant a live alarm fires                                                                        | wear-sync's `NativeFiredListener` (rings the watch); also durably queued and Channel-dispatched to Rust's `alarm-manager:native-fired` Tauri listener                       |
| `alarm-manager:dismiss-requested` | `id`                         | `AlarmManagerPlugin.notifyAlarmDismissed` (alarm-manager), on any dismiss origin that reaches `AlarmRingingService`'s `ACTION_DISMISS` handler | wear-sync's `NativeStopListener` (stops the watch's ring); also durably queued and Channel-dispatched to Rust                                                               |
| `alarm-manager:snooze-requested`  | `id`                         | `AlarmManagerPlugin.notifySnoozeRequested` (alarm-manager), on the notification's Snooze action                                                | wear-sync's `NativeStopListener` (stops the watch's ring); also durably queued and Channel-dispatched to Rust                                                               |
| `alarm-manager:import-requested`  | `id`                         | _(not published on `NativeEventBus` at all)_                                                                                                   | n/a — only durably queued and Channel-dispatched to Rust; there is no native Kotlin listener for it, so alarm-manager never calls `NativeEventBus.publish()` for this topic |
| `wear:alarm:dismiss`              | **`alarmId`**                | wear-sync's `WearMessageService`, **only on the offline path** (Rust/the plugin isn't loaded yet)                                              | alarm-manager's `WatchStopListener` (stops the phone's local ringing service)                                                                                               |
| `wear:alarm:snooze`               | **`alarmId`**                | wear-sync's `WearMessageService`, **only on the offline path**                                                                                 | alarm-manager's `WatchStopListener`                                                                                                                                         |

**Payload key inconsistency (deliberate, disclosed — this already tripped up a reviewer during implementation):** `wear:alarm:dismiss`/`wear:alarm:snooze` key the alarm id as `"alarmId"`, while every other topic in this table keys it as `"id"`. This isn't an oversight to be "fixed" — the two topic pairs come from different wire formats. alarm-manager's topics carry a freshly built `{"id": ...}` JSON object (`AlarmManagerPlugin.notifyAlarmDismissed`/`notifySnoozeRequested`). wear-sync's two topics instead republish the watch's own raw message payload **byte-for-byte, unparsed** — the exact bytes `WearDataLayerClient.sendDismissAlarm`/`sendSnoozeAlarm` sent from the watch, which predates issue #255 and uses `"alarmId"`. Do not assume the two pairs share a payload shape just because they're both dismiss/snooze signals on the same bus — always check which pair you're subscribing to.

Also note that `wear:alarm:dismiss`/`wear:alarm:snooze` are published on `NativeEventBus` **only when the phone-side plugin/Rust hasn't booted yet** (`WearMessageService`'s offline branch, `enqueueOfflineWrite`). When the plugin is already loaded, the message goes straight through the normal Tauri event pipeline (`plugin.onWatchMessage` -> Channel -> Rust emits `wear:alarm:dismiss`/`snooze` itself) with no `NativeEventBus` publish at all — there's no need for the native fast path once Rust is already up and can stop the ringing service itself.

### DurableEventQueue

`DurableEventQueue` (`DurableEventQueue.kt`) is **not** a singleton. Each plugin that needs durable "persist until Rust drains it" delivery instantiates its own `DurableEventQueue(store, prefsKey)`, with a `prefsKey` distinct from every other plugin's -- alarm-manager's `eventQueue(context)` and wear-sync's `WearSyncEventQueue` are two separate instances over two separate `SharedPreferences` keys, both built on the same generic class. This mirrors `WearSyncQueue`'s original one-log-per-plugin shape rather than `AlarmManagerPlugin`'s older pattern of one hand-rolled queue per event _type_ — a plugin with several event kinds (alarm-manager has fired/snooze/dismiss/import) needs only distinct `topic` strings on one `DurableEventQueue` instance, not one queue class per kind.

Each persisted entry is a schema-versioned JSON `Envelope`: `{v, topic, payload, eventId, publishedAt, handledNatively}`. `enqueue()` appends and returns a fresh UUID `eventId`; `drainAll(pipelineReady)` returns every entry across every topic that instance has ever enqueued, sorted by `publishedAt`, or an empty list if the pipeline isn't ready yet; `commit` removes only the entries a caller actually delivered successfully, leaving the rest for a later retry; `clear()` drops everything unconditionally. `drainAll` tolerates individual corrupt JSON entries and unrecognised schema versions by skipping just that entry rather than failing the whole drain — persisted entries have survived across multiple days on real devices, so this durability matters in practice.

**Both plugins migrated onto this class as a one-way step.** alarm-manager's four legacy, independently hand-rolled queues (fired/snooze/dismiss/import) were migrated on first launch into one `DurableEventQueue` log; wear-sync's `WearSyncEventQueue` (the offline watch-message queue) was migrated the same way. Both migrations run once, automatically, the first time the new code loads on a device that has any legacy queue entries — there is no code path back to the old per-type/hand-rolled formats, so an app **downgrade** to a build predating this change would no longer see any events left behind in the new log format (see the `RELEASE_NOTES.md` "Unreleased" note).

### The ContentProvider registration pattern

Both directions rely on their `NativeEventBus` listeners being registered **before any other Android component can run**, including on a cold multi-plugin process start — a listener registered even slightly late would miss the very broadcast it exists to react to. `ContentProvider.onCreate()` is documented to always run before any `Activity`/`Service`/`BroadcastReceiver` callback, which makes it the standard early-init trick (the same one Jetpack, WorkManager, and Firebase rely on), and this codebase uses a dedicated, otherwise-inert `ContentProvider` per plugin purely for that timing guarantee:

- **wear-sync's `WearRingInitProvider`** (issue #255 Phase 3B) registers `NativeFiredListener` and `NativeStopListener`, and warms `NativeFanOutPrefs`' in-memory toggle cache first so the listener's synchronous toggle check never blocks on disk.
- **alarm-manager's `WatchStopInitProvider`** (issue #255 Phase 4A) registers `WatchStopListener`, the symmetric watch-originated stop.

Both providers declare `android:exported="false"` (no real data, no external caller) and ship in every build — they are not debug-gated, since a cold-process fired event or a cold-process dismiss/snooze needs this path regardless of build type. Both are declared as `<provider>` elements directly in their own plugin's `AndroidManifest.xml` (`plugins/wear-sync/android/src/main/AndroidManifest.xml`, `plugins/alarm-manager/android/src/main/AndroidManifest.xml`) rather than injected via `build.rs` — see the Gotchas entry in the root `CLAUDE.md` and [plugin-manifest-quickstart.md](../plugins/plugin-manifest-quickstart.md), which already says to keep `<service>`/`<receiver>`/`<activity>` elements in the library manifest itself; `<provider>` follows the same rule.

### The `handled_natively` tag and the `"watch-ring"` case

`NativeEventBus.publish()`'s return value (the set of tags listeners reported) is meant to flow all the way to Rust so a Rust-side handler can know a side effect already happened natively and skip redoing it. Concretely, for the fired path:

1. wear-sync's `NativeFiredListener.handle()` returns the tag `"watch-ring"` once it has _initiated_ (not confirmed-delivered) the native watch ring.
2. That tag is meant to be threaded into the `DurableEventQueue.Envelope.handledNatively` set alarm-manager persists for the same fired event, then into `NativeAlarmFiredPayload.handled_natively` (`plugins/alarm-manager/src/models.rs`, the plugin-local Rust struct that deserializes the raw Channel payload), then finally into `AlarmFired.handled_natively` (`apps/threshold/src-tauri/src/alarm/events.rs`), which is the struct actually broadcast app-wide as `alarm:fired`.
3. wear-sync's own Rust `alarm:fired` listener (`plugins/wear-sync/src/lib.rs`) reads that field to decide whether to skip `send_alarm_ring`: `should_skip_native_watch_ring` returns `true` (skip) when `handled_natively` contains `"watch-ring"`, **or** when the event is stale (`actual_fired_at` older than `STALENESS_WINDOW_MS` = 90 000 ms, mirrored independently in Kotlin as `NativeFiredListener.STALENESS_WINDOW_MS`).

**In practice, step 2 never actually carries a populated tag.** `AlarmReceiver`'s `recordAndPublishFiredEvent` persists the fired event (calling `AlarmManagerPlugin.notifyAlarmFired`, which durably enqueues it and dispatches it toward Rust) **before** publishing the same payload on `NativeEventBus`:

```kotlin
persist(firedPayload)                    // durable enqueue + Channel dispatch toward Rust
return publishAlarmFiredToBus(firedPayload)  // NativeEventBus.publish — returns the tags
```

This ordering is deliberate, not an oversight: durable-persist-first means a process death between the two steps still leaves Rust with a record that the alarm fired (degraded to "no fast native ring", today's pre-Phase-3 behaviour), rather than losing the fire entirely. The unavoidable consequence is that `persist` runs _before_ this function knows what `NativeEventBus.publish()` is even going to return, so the payload handed to `persist` -- and therefore everything downstream of it, including `AlarmFired.handled_natively` as Rust ultimately sees it — always carries an **empty** `handledNatively`. The `"watch-ring"` tag genuinely exists and is exercised by unit tests (`should_skip_native_watch_ring`'s Kotlin and Rust suites both cover the tag-present case directly), but on the one call path that actually runs in production today, it is structurally never populated. `send_alarm_ring`'s real protection against a redundant ring today comes from the staleness check alone, backstopped by the watch's own ring de-duplication (`WearRingingService` ignores a duplicate ring message for an alarm it's already ringing — see [wear-sync.md](../plugins/wear-sync.md)) rather than from the tag. This is a known, accepted limitation of prioritising durability over the best-effort dedup hint on this synchronous path, not a bug to fix quietly.

### EventDedup: same-process redelivery only

`EventDedup` (`apps/threshold/src-tauri/src/event_dedup.rs`) is a small, shared, in-memory last-32-`eventId` ring buffer (`app.manage()`d once in `lib.rs`'s `setup`) that every one of the six native-originated Tauri listeners checks before acting: `wear:alarm:dismiss`, `wear:alarm:snooze`, `alarm-manager:native-fired`, `alarm-manager:dismiss-requested`, `alarm-manager:snooze-requested`, and `alarm-manager:import-requested`. `skip_duplicate_native_event` (also in `lib.rs`) is the one shared call site every listener uses.

**What it catches:** redelivery of the same `eventId` to the _same running process_ — e.g. two overlapping drain calls racing each other. Without it, a redelivered event re-runs whatever the listener does app-wide (a second dismiss/snooze toast, and for `wear:alarm:snooze` specifically, a second `snoozed_until = now + minutes` computation that silently re-anchors the alarm to a later time — not merely cosmetic).

**What it does NOT catch — read this precisely, it is a real, limited scope, not a general crash-safe dedup:** the buffer lives only in memory and starts empty on every launch. A crash in the narrow window between a successful `DurableEventQueue` drain delivery and that drain's trailing `commit()` call can redeliver the same event on the _next_ launch — but that crash necessarily takes down the very process holding the buffer, so the redelivered event lands in a brand-new, empty `EventDedup` that has never seen its `eventId`. It is structurally unable to catch its own crash-and-restart case. Events with no `eventId` at all (payloads predating this change) always report as "not a duplicate" — there is nothing to key a check on. Persisting this state (e.g. a small SQLite table via `tauri-plugin-sql`, the way `AlarmCoordinator` already owns durable state) so it can actually catch the crash-and-restart case is a deliberate, tracked follow-up — see the issue filed alongside this documentation pass.

### The fired -> watch-ring flow

This is the concrete shape of the two-delivery-planes idea above, and the fix for issue #254:

1. `AlarmReceiver.onReceive()` fires (`goAsync()`'d onto a single background executor so the main thread is never blocked).
2. It checks `AlarmUtils.isAlarmLive` — a cancelled/deleted alarm never reaches step 3 at all, so the watch can never ring for an alarm this receiver is about to disown.
3. `recordAndPublishFiredEvent` builds the shared `{id, actualFiredAt}` payload once, calls `persist` (durably enqueues it via `AlarmManagerPlugin.notifyAlarmFired`, and dispatches toward Rust's Channel if it's already registered), **then** publishes the same payload on `NativeEventBus`'s `alarm-manager:native-fired` topic.
4. If `WearRingInitProvider.onCreate()` has already run (guaranteed on any process where wear-sync is installed, per the ContentProvider pattern above), `NativeFiredListener` is already registered and receives the publish synchronously, in the same call. It checks the developer fan-out toggle and staleness, then hands the actual Play Services send off to its own coroutine scope and returns the `"watch-ring"` tag.
5. Independently, whenever Rust does boot (already running, or catching up from the durable queue), the app crate's `alarm-manager:native-fired` listener (`lib.rs`) deserialises the payload, checks `EventDedup`, and calls `AlarmCoordinator::report_alarm_fired`, which emits the canonical `alarm:fired` event app-wide.
6. wear-sync's own `alarm:fired` listener evaluates `should_skip_native_watch_ring` (staleness only, per the tag limitation above) and, if not stale, calls `send_alarm_ring` — which itself is a no-op if no watch node is currently connected (see the Gotchas entry in the root `CLAUDE.md`).

The net effect is that a cold-process fire rings the watch within the native path's latency (no Rust boot on the critical path), while Rust's own record of the fire — and its own, independent ring attempt — still lands correctly once it catches up, with the watch's own ring de-duplication absorbing the redundant message.

### The dismiss/snooze -> stop flow (both directions)

Issue #255 Phase 4 makes this symmetric with the fired path, for both cold-start cases:

**Phone-cold (a notification Dismiss/Snooze tapped before Rust has booted):** `AlarmRingingService`'s notification actions call `AlarmManagerPlugin.notifyAlarmDismissed`/`notifySnoozeRequested`, which durably enqueue toward Rust _and_ publish on `NativeEventBus`'s `alarm-manager:dismiss-requested`/`snooze-requested` topics. wear-sync's `NativeStopListener` (registered by `WearRingInitProvider`, so live before `AlarmRingingService` can post through the channel) receives the publish and sends the corresponding stop message to every connected watch node directly via Play Services — no Rust involvement needed for the physical "stop the watch's ring" side effect. Rust's own DB-level dismiss/re-arm still happens once it catches up via the durable queue, exactly as for the fired path.

**Watch-cold (the watch dismisses/snoozes while the phone's Rust hasn't booted):** `WearMessageService`'s offline branch durably enqueues the watch's raw message _and_ publishes it, byte-for-byte, on `NativeEventBus`'s `wear:alarm:dismiss`/`wear:alarm:snooze` topics (the `"alarmId"`-keyed payloads noted in the topic table above). alarm-manager's `WatchStopListener` (registered by `WatchStopInitProvider`) receives the publish and, if the target alarm id matches whatever is currently ringing locally (`AlarmRingingService.currentlyRingingAlarmId`), calls `context.stopService(...)` directly -- again, the physical "silence the phone" side effect happens with no dependency on Rust. Unlike the fired path, neither `NativeStopListener` nor `WatchStopListener` claims a tag or applies a staleness gate: per issue #255's design, a double-delivered _stop_ signal is benign (the receiving side already safely no-ops a dismiss/snooze for an alarm it isn't actively ringing), so there is no failure mode symmetric to "ring the watch twice" that a tag would need to guard against.

---

## App Startup Integration

### Hooking Critical Fixes into lib.rs

Both critical fixes (heal-on-launch + maintenance) must run at app startup:

```rust
// apps/threshold/src-tauri/src/lib.rs

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:alarms.db", alarm::database::migrations())
                .build()
        )
        .setup(|app| {
            // Initialize database
            let db = tauri::async_runtime::block_on(async {
                AlarmDatabase::new(app.handle()).await
            })?;

            let coordinator = AlarmCoordinator::new(db);

            // ⭐ CRITICAL FIX #2: Heal-on-launch (prevents boot recovery split brain)
            tauri::async_runtime::block_on(async {
                coordinator.heal_on_launch(app.handle()).await
            })?;

            // ⭐ CRITICAL FIX #1: Cleanup old tombstones (prevents zombie alarms)
            tauri::async_runtime::block_on(async {
                coordinator.run_maintenance().await
            }).ok();

            // Schedule daily maintenance
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(
                    tokio::time::Duration::from_secs(86400) // 24 hours
                );
                loop {
                    interval.tick().await;
                    if let Ok(coord) = app_handle.try_state::<AlarmCoordinator>() {
                        coord.run_maintenance().await.ok();
                    }
                }
            });

            app.manage(coordinator);

            Ok(())
        })
        .plugin(alarm_manager::init())
        .plugin(wear_sync::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_alarms,
            commands::save_alarm,
            commands::toggle_alarm,
            commands::delete_alarm,
            commands::dismiss_alarm,
            commands::snooze_alarm,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Why This Order?**

1. **Initialize DB** - Source of truth must exist first
2. **Heal-on-launch** - Fix any stale SharedPreferences from crashes
3. **Run maintenance** - Clean up old tombstones (optional on first launch)
4. **Schedule daily maintenance** - Keep tombstones pruned
5. **Manage coordinator** - Make available to commands
6. **Register plugins** - alarm-manager receives healed events

**Performance Impact:**

- Database init: ~50ms
- Heal-on-launch: ~35-115ms (5-20 alarms)
- Maintenance: ~1ms
- **Total: ~100-170ms added to startup**

This is acceptable - total app startup is typically 500-1000ms.

---

## Implementation Phases

### Phase 1: Add Revision System (2-3 hours)

**Files to modify:**

1. `apps/threshold/src-tauri/src/alarm/models.rs`
   - Add `revision: i64` to `AlarmRecord`

2. `apps/threshold/src-tauri/src/alarm/database.rs`
   - Add Migration v2 (revision tables)
   - Add `next_revision()`, `current_revision()` methods
   - Update `save()` signature to accept revision
   - Add `get_alarms_since_revision()`, `get_deleted_since_revision()`
   - Add `delete_with_revision()`, `cleanup_tombstones_before()`

3. `apps/threshold/src-tauri/src/alarm/mod.rs`
   - Update `save_alarm()` to call `next_revision()` before save
   - Update `delete_alarm()` to call `next_revision()` and `delete_with_revision()`

**Test:**

```bash
cargo test
pnpm tauri dev
# In browser console:
await window.__TAURI__.core.invoke('get_alarms')
// Should have revision: 1
```

---

### Phase 2: Implement Event System (3-4 hours)

**File:** `apps/threshold/src-tauri/src/alarm/events.rs`

Copy the event struct definitions from this document (sections 4.1-4.9).

Add helper functions:

```rust
impl AlarmSnapshot {
    pub fn from_alarm(alarm: &AlarmRecord) -> Self {
        Self {
            id: alarm.id,
            enabled: alarm.enabled,
            next_trigger: alarm.next_trigger,
            revision: alarm.revision,
        }
    }
}

impl AlarmsBatchUpdated {
    pub fn single(id: i32, revision: i64) -> Self {
        Self {
            updated_ids: vec![id],
            revision,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}
```

**Test:**

```typescript
// In browser console
import { listen } from '@tauri-apps/api/event';

await listen('alarm:created', (event) => {
	console.log('Created:', event.payload);
});

await window.__TAURI__.core.invoke('save_alarm', {
	alarm: { enabled: true, mode: 'FIXED', fixedTime: '09:00', activeDays: [1, 2, 3, 4, 5] },
});
// Should see event logged
```

---

### Phase 3: Update alarm-manager (2-3 hours)

**File:** `plugins/alarm-manager/src/lib.rs`

Replace event listener:

```rust
// OLD: Listen to alarms:changed
app.listen("alarms:changed", ...);

// NEW: Listen to specific events
app.listen("alarm:scheduled", move |event| {
    let payload: AlarmScheduled = serde_json::from_str(event.payload()).unwrap();
    // Schedule native alarm
});

app.listen("alarm:cancelled", move |event| {
    let payload: AlarmCancelled = serde_json::from_str(event.payload()).unwrap();
    // Cancel native alarm
});
```

---

### Phase 4: Integrate wear-sync (4-5 hours)

**File:** `plugins/wear-sync/src/lib.rs`

Implement BatchCollector pattern:

```rust
struct BatchCollector {
    pending_ids: HashSet<i32>,
    latest_revision: i64,
    debounce_timer: Option<Instant>,
}

app.listen("alarms:batch:updated", move |event| {
    let payload: AlarmsBatchUpdated = serde_json::from_str(event.payload()).unwrap();
    collector.on_batch_event(payload);
});
```

Add sync commands:

- `sync_from_watch`
- `save_alarm_from_watch`

---

### Phase 5: TypeScript Migration (3-4 hours)

**Files:**

- Create `apps/threshold/src/services/AlarmService.ts`
- Update all screens to use `AlarmService` instead of `DatabaseService`
- Remove old `DatabaseService.ts`

---

## Testing Strategy

### Unit Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_revision_increments() {
        let db = create_test_db().await;
        let rev1 = db.next_revision().await.unwrap();
        let rev2 = db.next_revision().await.unwrap();
        assert_eq!(rev2, rev1 + 1);
    }

    #[tokio::test]
    async fn test_alarm_stamped_with_revision() {
        let db = create_test_db().await;
        let rev = db.next_revision().await.unwrap();
        let input = AlarmInput::default();
        let alarm = db.save(input, Some(123456), rev).await.unwrap();
        assert_eq!(alarm.revision, rev);
    }

    #[tokio::test]
    async fn test_incremental_sync() {
        let db = create_test_db().await;
        // Create alarm with rev 1
        let rev1 = db.next_revision().await.unwrap();
        db.save(input1, None, rev1).await.unwrap();

        // Create alarm with rev 2
        let rev2 = db.next_revision().await.unwrap();
        db.save(input2, None, rev2).await.unwrap();

        // Get changes since rev 1
        let changed = db.get_alarms_since_revision(1).await.unwrap();
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].revision, 2);
    }
}
```

### Integration Tests

**Scenario 1: Create alarm → Events fire**

```
1. Create alarm via invoke('save_alarm')
2. Verify: alarm:created event fired
3. Verify: alarm:scheduled event fired
4. Verify: alarms:batch:updated event fired
5. Verify: alarm-manager scheduled native alarm
```

**Scenario 2: Toggle alarm → Correct events**

```
1. Toggle alarm off
2. Verify: alarm:updated event fired
3. Verify: alarm:cancelled event fired (reason: DISABLED)
4. Verify: alarm-manager cancelled native alarm
```

**Scenario 3: Incremental sync**

```
1. Watch at revision 42
2. Phone creates 3 alarms (rev 43, 44, 45)
3. Watch syncs
4. Verify: SyncResponse::Incremental with 3 alarms
5. Verify: Watch now at revision 45
```

**Scenario 4: Conflict resolution**

```
1. Watch edits alarm #5 (has revision 42)
2. Phone already updated to revision 44
3. Watch sends save_alarm_from_watch
4. Verify: Rejected with "Stale revision"
5. Watch syncs to get latest
```

---

## Performance Targets

| Metric                    | Target        | Current | How to Measure |
| ------------------------- | ------------- | ------- | -------------- |
| Event emission            | < 5ms         | TBD     | Rust benchmark |
| Payload size (CRUD)       | 100-200 bytes | TBD     | JSON stringify |
| Payload size (Scheduling) | 80 bytes      | TBD     | JSON stringify |
| wear-sync debounce        | 500ms         | TBD     | Manual timing  |
| Watch sync (full)         | < 2s          | TBD     | Manual timing  |
| Incremental sync          | < 500ms       | TBD     | Manual timing  |

---

## Migration Notes

### From Current State (Milestone A)

**Current:**

- ✅ Rust alarm core exists
- ❌ No revisions
- ❌ No events
- ❌ TypeScript uses DatabaseService

**Migration Steps:**

1. Add revision system (non-breaking - new columns)
2. Add event system (non-breaking - just emitting)
3. Update alarm-manager to subscribe (non-breaking - still works without)
4. Migrate TypeScript (breaking - remove DatabaseService)
5. Integrate wear-sync (new feature)

**Database Migration:**

```sql
-- Existing users will get:
ALTER TABLE alarms ADD COLUMN revision INTEGER DEFAULT 1;
-- All existing alarms start at revision 1
-- New alarms increment from there
```

**Backwards Compatibility:**

- Revision system is additive (doesn't break existing code)
- Events are fire-and-forget (doesn't break if no listeners)
- alarm-manager can work with OR without events (graceful degradation)

---

## Next Steps

**Immediate (Today):**

1. ✅ Read this document
2. ✅ Review implementation phases
3. ⏭️ Start Phase 1: Add revision system

**This Week:**

- Complete Phases 1-2 (revisions + events)
- Test with DevTools console
- Update implementation-roadmap.md with progress

**Next Week:**

- Complete Phases 3-4 (alarm-manager + wear-sync)
- Begin TypeScript migration (Phase 5)
- Start Wear OS app (Milestone E)

---

## Visual Reference

For visual learners, here are the key diagrams showing how the event system works.

### Event Taxonomy

```mermaid
graph TB
    Events[Threshold Events]

    Events --> CRUD[CRUD Events<br/>Database State Changes]
    Events --> Sched[Scheduling Events<br/>Platform Actions]
    Events --> Life[Lifecycle Events<br/>State Transitions]
    Events --> Batch[Batch Events<br/>Optimisation Signals]

    CRUD --> Created["alarm:created<br/>New alarm saved"]
    CRUD --> Updated["alarm:updated<br/>Alarm modified"]
    CRUD --> Deleted["alarm:deleted<br/>Alarm removed"]

    Sched --> Scheduled["alarm:scheduled<br/>Schedule native alarm"]
    Sched --> Cancelled["alarm:cancelled<br/>Cancel native alarm"]

    Life --> Fired["alarm:fired<br/>Alarm ringing"]
    Life --> Dismissed["alarm:dismissed<br/>User dismissed"]
    Life --> Snoozed["alarm:snoozed<br/>User snoozed"]

    Batch --> BatchUpdate["alarms:batch:updated<br/>Changes buffered"]
    Batch --> SyncNeeded["alarms:sync:needed<br/>Explicit sync request"]

    style Events fill:#1e293b,stroke:#64748b,color:#f1f5f9
    style CRUD fill:#10b981,stroke:#059669,color:#ffffff
    style Sched fill:#3b82f6,stroke:#2563eb,color:#ffffff
    style Life fill:#f59e0b,stroke:#d97706,color:#ffffff
    style Batch fill:#8b5cf6,stroke:#7c3aed,color:#ffffff
```

### Create Alarm Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as TypeScript UI
    participant Core as Rust Core
    participant AlarmMgr as Alarm Manager
    participant WearSync as Wear Sync
    participant Watch as Watch App

    User->>UI: Tap "Save"
    UI->>UI: Optimistic update<br/>(instant UI)
    UI->>Core: invoke('save_alarm')

    rect rgb(30, 41, 59)
    note right of Core: Database Operations
    Core->>Core: Calculate next_trigger<br/>(random in window)
    Core->>Core: Save to SQLite
    end

    rect rgb(16, 185, 129)
    note right of Core: CRUD Event
    Core-->>UI: alarm:created { alarm }
    Core-->>WearSync: alarm:created { alarm }
    end

    rect rgb(59, 130, 246)
    note right of Core: Scheduling Event
    Core-->>AlarmMgr: alarm:scheduled { id, triggerAt }
    end

    rect rgb(139, 92, 246)
    note right of Core: Batch Event
    Core-->>WearSync: alarms:batch:updated { ids }
    end

    UI->>UI: Update with canonical state
    AlarmMgr->>AlarmMgr: Schedule native alarm<br/>Save to SharedPreferences
    WearSync->>WearSync: Add to buffer<br/>Start 500ms timer

    Note over WearSync: Debounce timer fires...
    WearSync->>Core: Fetch all alarms
    Core-->>WearSync: Vec<AlarmRecord>
    WearSync->>Watch: Publish to Data Layer

    Watch->>Watch: Update UI
```

### Performance Comparison

**Event Payload Sizes:**

- ❌ Old: `alarms:changed` ~1200 bytes (full Vec<AlarmRecord>)
- ✅ New: `alarm:created` ~220 bytes (single AlarmRecord)
- ✅ New: `alarm:scheduled` ~80 bytes (id, triggerAt, soundUri, label, mode)
- ✅ New: `alarm:cancelled` ~40 bytes (id, reason)
- ✅ New: `alarms:batch:updated` ~60 bytes (updatedIds[], revision, timestamp)

**Benefits:**

- **Efficiency:** 80 byte payloads vs 1200 byte payloads
- **Clarity:** Semantic event names make intent obvious
- **No Diffing:** alarm-manager receives exact action (schedule/cancel)
- **Batching:** wear-sync buffers 5 rapid edits → 1 sync
- **Instant UI:** Optimistic updates with canonical state reconciliation

---

## Related Documents

- `docs/architecture/implementation-roadmap.md` - Build plan
- `docs/architecture/data-architecture.md` - Data models
- `docs/architecture/getting-started.md` - Setup guide
- `docs/wear-implementation/ui-mockups.md` - Watch app designs

---

**Questions? Issues?**

- GitHub: `#92` (current tracking issue)
- Branch: `feat/wear-os-companion-support`
- Milestone: "Wear OS D — Wear Sync Plugin"

**This architecture is production-ready. Let's implement it! 🚀**
