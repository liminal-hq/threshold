use serde::{Deserialize, Serialize};

/// Complete alarm configuration (returned to TypeScript)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmRecord {
    pub id: i32,
    pub label: Option<String>,
    pub enabled: bool,
    pub mode: AlarmMode,
    pub fixed_time: Option<String>,       // "HH:MM"
    pub window_start: Option<String>,     // "HH:MM"
    pub window_end: Option<String>,       // "HH:MM"
    pub active_days: Vec<i32>,             // [0-6] where 0=Sun
    pub next_trigger: Option<i64>,         // Epoch millis
    pub sound_uri: Option<String>,
    pub sound_title: Option<String>,
    pub revision: i64,
}

/// Input for creating/updating alarms (from TypeScript)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmInput {
    pub id: Option<i32>,
    pub label: Option<String>,
    pub enabled: bool,
    pub mode: AlarmMode,
    pub fixed_time: Option<String>,
    pub window_start: Option<String>,
    pub window_end: Option<String>,
    pub active_days: Vec<i32>,
    pub sound_uri: Option<String>,
    pub sound_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AlarmMode {
    Fixed,
    Window,
}

impl Default for AlarmInput {
    fn default() -> Self {
        Self {
            id: None,
            label: None,
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".into()),
            window_start: None,
            window_end: None,
            active_days: vec![1, 2, 3, 4, 5], // Weekdays
            sound_uri: None,
            sound_title: None,
        }
    }
}
