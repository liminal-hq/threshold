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
#[serde(rename_all = "camelCase")]
pub struct WatchMessage {
    pub path: String,
    pub data: String,
    /// The `WearSyncEventQueue`/`DurableEventQueue` envelope's UUID this message was queued
    /// under (see `WearSyncPlugin.drainQueuedMessages`, which now stamps it in alongside
    /// `path`/`data`). `#[serde(default)]` so this deserializes cleanly from any payload that
    /// predates this field. `None` is possible in principle (e.g. a future call site that
    /// doesn't go through the queue) but not expected in practice today.
    #[serde(default)]
    pub event_id: Option<String>,
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
    /// Threaded through from `WatchMessage::event_id` by `handle_watch_message` (not parsed
    /// from the watch's own JSON payload, which never includes it) so a same-process dedup
    /// pass keyed on event id (issue #255 Phase 3C) has something to key on for
    /// watch-originated dismisses too, not just the fired path. `#[serde(default)]` so this
    /// still deserializes cleanly on its own from the watch's raw payload before the id is
    /// attached.
    #[serde(default)]
    pub event_id: Option<String>,
}

/// Watch-originated alarm snooze command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchSnoozeAlarm {
    pub alarm_id: i32,
    pub snooze_length_minutes: i32,
    /// See [WatchDismissAlarm::event_id] -- same threading, same reasoning.
    #[serde(default)]
    pub event_id: Option<String>,
}

// ── Phone → Watch message types (Rust → Kotlin) ─────────────────────

/// Payload for the alarm:fired event (from alarm coordinator).
///
/// This is wear-sync's own local copy of the wire shape the app crate's
/// `apps/threshold/src-tauri/src/alarm/events.rs::AlarmFired` broadcasts as `alarm:fired` --
/// a separate Rust type in a separate crate, not a shared import, so it carries the same
/// fields by convention rather than by the compiler.
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
    /// Side-effect tags already handled natively (Kotlin) for this event, per issue #255's
    /// Phase 3 payload contract -- e.g. `["watch-ring"]` when wear-sync's own
    /// `NativeFiredListener` (Kotlin) already rang the watch in-process before Rust ever saw
    /// this event. `#[serde(default)]` so this deserializes cleanly from any payload that
    /// predates this field (desktop, or a queued pre-Phase-3 event replayed after upgrade).
    #[serde(default)]
    pub handled_natively: Vec<String>,
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
    /// `None` means "use the device's current time" — the Kotlin side falls
    /// back to `Calendar`. Omitted from the JSON entirely rather than sent
    /// as `null`, since the Kotlin arg class's `hour`/`minute` are non-null.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hour: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minute: Option<i32>,
    pub snooze_length_minutes: i32,
    #[serde(default = "default_is_24_hour")]
    pub is_24_hour: bool,
    #[serde(default = "default_is_24_hour_known")]
    pub is_24_hour_known: bool,
}

/// Request to send an alarm dismiss message to the watch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmDismissRequest {
    pub alarm_id: i32,
}

/// Request to send an alarm snooze message to the watch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmSnoozeRequest {
    pub alarm_id: i32,
    pub snooze_length_minutes: i32,
}

// ── Native fan-out developer toggle (issue #255 Phase 3B) ───────────

/// Request to set the "disable native watch fan-out" developer toggle.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetNativeFanOutEnabledRequest {
    pub enabled: bool,
}

/// Response from reading the "disable native watch fan-out" developer toggle.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFanOutEnabledResponse {
    pub enabled: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── WatchMessage / WatchDismissAlarm / WatchSnoozeAlarm event_id threading ──────────

    #[test]
    fn watch_message_deserialises_event_id_from_camel_case_key() {
        let json = r#"{"path":"/threshold/alarm_dismiss","data":"{}","eventId":"abc-123"}"#;
        let msg: WatchMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.event_id, Some("abc-123".to_string()));
    }

    #[test]
    fn watch_message_event_id_defaults_to_none_when_absent() {
        // Mirrors a payload that predates this field (or any future caller that doesn't
        // stamp one) -- must still deserialize cleanly rather than erroring.
        let json = r#"{"path":"/threshold/sync_request","data":"0"}"#;
        let msg: WatchMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.event_id, None);
    }

    #[test]
    fn watch_dismiss_alarm_deserialises_from_the_watch_own_payload_with_no_event_id() {
        // The watch's own JSON payload never includes eventId -- that's threaded in
        // separately by handle_watch_message from the outer WatchMessage envelope.
        let json = r#"{"alarmId":7}"#;
        let cmd: WatchDismissAlarm = serde_json::from_str(json).unwrap();
        assert_eq!(cmd.alarm_id, 7);
        assert_eq!(cmd.event_id, None);
    }

    #[test]
    fn watch_dismiss_alarm_event_id_round_trips_once_set() {
        let mut cmd: WatchDismissAlarm = serde_json::from_str(r#"{"alarmId":7}"#).unwrap();
        cmd.event_id = Some("queue-envelope-id".to_string());

        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"eventId\":\"queue-envelope-id\""));
    }

    #[test]
    fn watch_snooze_alarm_deserialises_from_the_watch_own_payload_with_no_event_id() {
        let json = r#"{"alarmId":7,"snoozeLengthMinutes":10}"#;
        let cmd: WatchSnoozeAlarm = serde_json::from_str(json).unwrap();
        assert_eq!(cmd.alarm_id, 7);
        assert_eq!(cmd.snooze_length_minutes, 10);
        assert_eq!(cmd.event_id, None);
    }

    #[test]
    fn watch_snooze_alarm_event_id_round_trips_once_set() {
        let mut cmd: WatchSnoozeAlarm =
            serde_json::from_str(r#"{"alarmId":7,"snoozeLengthMinutes":10}"#).unwrap();
        cmd.event_id = Some("queue-envelope-id".to_string());

        let json = serde_json::to_string(&cmd).unwrap();
        assert!(json.contains("\"eventId\":\"queue-envelope-id\""));
    }
}
