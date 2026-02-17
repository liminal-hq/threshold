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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRequest {
    /// The revision the watch should sync from.
    pub revision: i64,
}

// ── Watch message types (Kotlin → Rust via triggered events) ────────

/// Payload from the Kotlin `trigger("wear:message:received", ...)` call.
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
