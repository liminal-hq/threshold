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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickAlarmSoundOptions {
    pub existing_uri: Option<String>,
    pub title: Option<String>,
    pub show_silent: Option<bool>,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveAlarmResponse {
    pub is_alarm: bool,
    pub alarm_id: Option<i32>,
}
