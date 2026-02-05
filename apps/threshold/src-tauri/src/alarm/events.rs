use serde::{Deserialize, Serialize};
use crate::alarm::models::{AlarmRecord, AlarmMode};

// =========================================================================
// CRUD Events
// =========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when a new alarm is created.
pub struct AlarmCreated {
    pub alarm: AlarmRecord,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when an existing alarm is updated, with an optional snapshot of the prior state.
pub struct AlarmUpdated {
    pub alarm: AlarmRecord,
    pub previous: Option<AlarmSnapshot>,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Snapshot of an alarm's key fields for change comparison.
/// A snapshot is a minimal, read-only copy of state captured at a point in time.
pub struct AlarmSnapshot {
    pub id: i32,
    pub enabled: bool,
    pub next_trigger: Option<i64>,
    pub revision: i64,
}

impl AlarmSnapshot {
    /// Builds a minimal snapshot of an alarm for update comparisons.
    pub fn from_alarm(alarm: &AlarmRecord) -> Self {
        Self {
            id: alarm.id,
            enabled: alarm.enabled,
            next_trigger: alarm.next_trigger,
            revision: alarm.revision,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when an alarm is deleted.
pub struct AlarmDeleted {
    pub id: i32,
    pub label: Option<String>,
    pub revision: i64,
}

// =========================================================================
// Scheduling Events
// =========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when an alarm is scheduled with the native alarm manager.
pub struct AlarmScheduled {
    pub id: i32,
    pub trigger_at: i64,
    pub sound_uri: Option<String>,
    pub label: Option<String>,
    pub mode: AlarmMode,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when a scheduled alarm is cancelled.
pub struct AlarmCancelled {
    pub id: i32,
    pub reason: CancelReason,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
/// Enumerates why a scheduled alarm was cancelled.
pub enum CancelReason {
    Disabled,   // User toggled off
    Deleted,    // User deleted alarm
    Updated,    // Rescheduling with new trigger
    Expired,    // One-time alarm fired
}

// =========================================================================
// Lifecycle Events
// =========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when a native alarm fires.
pub struct AlarmFired {
    pub id: i32,
    pub trigger_at: i64,
    pub actual_fired_at: i64,
    pub label: Option<String>,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when a user dismisses a ringing alarm.
pub struct AlarmDismissed {
    pub id: i32,
    pub fired_at: i64,
    pub dismissed_at: i64,
    pub next_trigger: Option<i64>,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when a user snoozes a ringing alarm.
pub struct AlarmSnoozed {
    pub id: i32,
    pub original_trigger: i64,
    pub snoozed_until: i64,
    pub revision: i64,
}

// =========================================================================
// Batch Events
// =========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when one or more alarms change to enable batched sync.
pub struct AlarmsBatchUpdated {
    pub updated_ids: Vec<i32>,
    pub revision: i64,
    pub timestamp: i64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when an explicit sync is required.
pub struct AlarmsSyncNeeded {
    pub reason: SyncReason,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
/// Enumerates why an explicit sync was requested.
pub enum SyncReason {
    BatchComplete,  // Debounce timer expired
    Initialize,     // App startup
    Reconnect,      // Watch reconnected
    ForceSync,      // User requested
}
