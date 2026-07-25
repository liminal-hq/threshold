// Alarm manager request and event payload models
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRequest {
    pub id: i32,
    pub trigger_at: i64,
    pub sound_uri: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRequest {
    pub id: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAlarm {
    pub id: i32,
    pub hour: i32,
    pub minute: i32,
    pub label: String,
    /// Days of week this alarm is active on, 0=Sunday..6=Saturday. Empty means
    /// "one-time" per the SET_ALARM contract -- Kotlin already resolves this to a
    /// single-day array before sending, so it's non-empty in practice, but the type
    /// doesn't promise that.
    pub active_days: Vec<i32>,
    /// Epoch millis of the originally-computed one-shot occurrence, for staleness checks.
    pub trigger_at: i64,
}

// Kotlin's PickAlarmSoundOptions arg class declares non-null fields with
// defaults (e.g. `showSilent: Boolean = true`); a JSON `null` fails to
// deserialise into them, so every field here must be omitted when absent
// rather than sent as `null`.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickAlarmSoundOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_silent: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_default: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedAlarmSound {
    pub uri: Option<String>,
    pub is_silent: bool,
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RingEventPayload {
    pub id: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeAlarmFiredPayload {
    pub id: i32,
    pub actual_fired_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeSnoozeRequestedPayload {
    pub id: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeDismissRequestedPayload {
    pub id: i32,
}

/// Shared response shape for the plugin's various silently-degrading-permission checks
/// (full-screen intent, exact alarm scheduling, battery optimization exemption) -- they're
/// structurally identical, so one type covers all three rather than one per permission.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    pub granted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentlyRingingAlarm {
    pub id: Option<i32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imported_alarm_deserializes_active_days_and_trigger_at_from_kotlins_wire_shape() {
        // Mirrors the exact JSON AlarmManagerPlugin.kt's getLaunchArgs/import channel
        // sends -- activeDays and triggerAt were silently dropped by an earlier version
        // of this struct that didn't declare them, since serde ignores unknown fields
        // by default rather than erroring. That bug never surfaced in TS unit tests
        // because those mock invoke() directly with objects that already included both
        // fields, bypassing this struct's real (de)serialization entirely.
        let json = r#"{
            "id": 12345,
            "hour": 7,
            "minute": 30,
            "label": "Wake up",
            "activeDays": [1, 3, 5],
            "triggerAt": 1783656000000
        }"#;

        let imported: ImportedAlarm = serde_json::from_str(json).expect("should deserialize");

        assert_eq!(imported.active_days, vec![1, 3, 5]);
        assert_eq!(imported.trigger_at, 1783656000000);
    }
}
