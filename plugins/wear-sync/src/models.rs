// Shared types — event payloads, bridge requests, and watch message models
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{Deserialize, Serialize};

// ── Event payloads ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmsBatchUpdated {
    pub updated_ids: Vec<i32>,
    pub revision: i64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmsSyncNeeded {
    pub reason: SyncReason,
    pub revision: i64,
    /// Pre-serialised JSON array of all alarms (populated by the app crate).
    #[serde(default)]
    pub all_alarms_json: Option<String>,
    /// Snooze duration in minutes (from phone settings).
    #[serde(default = "default_snooze_length")]
    pub snooze_length_minutes: i32,
    /// Time format preference from phone settings (`true` = 24-hour clock).
    #[serde(default = "default_is_24_hour")]
    pub is_24_hour: bool,
    /// Whether the phone time format value is explicitly known.
    #[serde(default = "default_is_24_hour_known")]
    pub is_24_hour_known: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncReason {
    BatchComplete,
    Initialize,
    Reconnect,
    ForceSync,
}

// ── Bridge request/response types (shared by mobile.rs and desktop.rs) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishRequest {
    /// JSON-serialised array of alarm records.
    pub alarms_json: String,
    /// The phone's current revision at the time of publish.
    pub revision: i64,
    /// Snooze duration in minutes (from phone settings).
    #[serde(default = "default_snooze_length")]
    pub snooze_length_minutes: i32,
    /// Time format preference from phone settings (`true` = 24-hour clock).
    #[serde(default = "default_is_24_hour")]
    pub is_24_hour: bool,
    /// Whether the phone time format value is explicitly known.
    #[serde(default = "default_is_24_hour_known")]
    pub is_24_hour_known: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRequest {
    /// The revision the watch should sync from.
    pub revision: i64,
}

// ── Watch message types (Kotlin → Rust via Channel) ─────────────────

/// Watch message received from Kotlin via the JNI-backed Channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchMessage {
    pub path: String,
    pub data: String,
}

/// Watch-originated alarm save command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchSaveAlarm {
    pub alarm_id: i32,
    pub enabled: bool,
    pub watch_revision: i64,
}

/// Watch-originated alarm delete command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchDeleteAlarm {
    pub alarm_id: i32,
    pub watch_revision: i64,
}

/// Watch-originated sync request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchSyncRequest {
    pub watch_revision: i64,
}

/// Watch-originated alarm dismiss command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchDismissAlarm {
    pub alarm_id: i32,
}

/// Watch-originated alarm snooze command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchSnoozeAlarm {
    pub alarm_id: i32,
    pub snooze_length_minutes: i32,
}

// ── Phone → Watch message types (Rust → Kotlin) ─────────────────────

/// Payload for the alarm:fired event (from alarm coordinator).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmFired {
    pub id: i32,
    pub trigger_at: i64,
    pub actual_fired_at: i64,
    pub label: Option<String>,
    pub revision: i64,
    /// Snooze duration in minutes (synced from phone settings).
    #[serde(default = "default_snooze_length")]
    pub snooze_length_minutes: i32,
    /// Time format preference from phone settings (`true` = 24-hour clock).
    #[serde(default = "default_is_24_hour")]
    pub is_24_hour: bool,
    /// Whether the phone time format value is explicitly known.
    #[serde(default = "default_is_24_hour_known")]
    pub is_24_hour_known: bool,
}

fn default_snooze_length() -> i32 {
    10
}

fn default_is_24_hour() -> bool {
    false
}

fn default_is_24_hour_known() -> bool {
    false
}

/// Request to send an alarm ring message to the watch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmRingRequest {
    pub alarm_id: i32,
    pub label: String,
    pub hour: i32,
    pub minute: i32,
    pub snooze_length_minutes: i32,
    #[serde(default = "default_is_24_hour")]
    pub is_24_hour: bool,
    #[serde(default = "default_is_24_hour_known")]
    pub is_24_hour_known: bool,
}
