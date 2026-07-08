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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAlarm {
    pub id: i32,
    pub hour: i32,
    pub minute: i32,
    pub label: String,
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
