// Alarm event types emitted through the Tauri event bus
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use crate::alarm::models::{AlarmMode, AlarmRecord};
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
/// Enumerates why a scheduled alarm was cancelled.
pub enum CancelReason {
    Disabled, // User toggled off
    Deleted,  // User deleted alarm
    Updated,  // Rescheduling with new trigger
    Expired,  // One-time alarm fired
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
    /// Snooze duration in minutes (synced from phone settings).
    #[serde(default = "default_snooze_length")]
    pub snooze_length_minutes: i32,
    /// Time format preference (synced from phone settings).
    #[serde(default = "default_is_24_hour")]
    pub is_24_hour: bool,
    /// Whether the phone time format value is explicitly known.
    #[serde(default = "default_is_24_hour_known")]
    pub is_24_hour_known: bool,
    /// Side-effect tags a native listener already handled at publish time (e.g.
    /// `"watch-ring"`), per issue #255's Phase 3 payload contract. `#[serde(default)]` so
    /// this deserializes cleanly from any payload predating this field -- desktop has no
    /// native bus at all, so its fired events simply never populate this and get an empty
    /// `Vec` here, which is expected.
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
    /// Pre-serialised JSON array of all alarms for wear sync.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub all_alarms_json: Option<String>,
    /// Snooze duration in minutes (from phone settings) to sync to the watch.
    #[serde(default = "default_snooze_length")]
    pub snooze_length_minutes: i32,
    /// Time format preference (from phone settings) to sync to the watch.
    #[serde(default = "default_is_24_hour")]
    pub is_24_hour: bool,
    /// Whether the phone time format value is explicitly known.
    #[serde(default = "default_is_24_hour_known")]
    pub is_24_hour_known: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
/// Enumerates why an explicit sync was requested.
pub enum SyncReason {
    BatchComplete, // Debounce timer expired
    Initialize,    // App startup
    Reconnect,     // Watch reconnected
    ForceSync,     // User requested
}

// =========================================================================
// Widget Events
// =========================================================================

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// The alarm with the earliest upcoming trigger among enabled alarms.
pub struct NextAlarm {
    pub id: i32,
    pub label: Option<String>,
    pub trigger_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// One light-or-dark colour set for the home-screen widget's eight visual roles, all lowercase `#rrggbb` hex.
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
/// Light and dark widget palettes computed by the frontend for the active theme (TS owns theme resolution; Rust just stores and relays this).
pub struct WidgetThemePalettes {
    pub light: WidgetThemePalette,
    pub dark: WidgetThemePalette,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Emitted when the app-wide next alarm changes, for home-screen widgets.
pub struct AlarmNextChanged {
    pub alarm: Option<NextAlarm>,
    pub is_24_hour: Option<bool>,
    /// `null` means "not pushed yet" (e.g. the seed emission at startup before the webview has applied a theme) -- consumers keep their last stored theme rather than treating `null` as "clear it".
    pub theme: Option<WidgetThemePalettes>,
}

#[cfg(test)]
mod widget_theme_palette_tests {
    use super::*;

    #[test]
    fn serialises_to_the_pinned_wire_shape() {
        let palettes = WidgetThemePalettes {
            light: WidgetThemePalette {
                fill: "#ffffff".into(),
                stroke: "#dfe5ee".into(),
                rail: "#002244".into(),
                eyebrow: "#b7541e".into(),
                time: "#1a1a1a".into(),
                label: "#5a6a80".into(),
                rail_muted: "#aab4c2".into(),
                text_muted: "#5a6a80".into(),
            },
            dark: WidgetThemePalette {
                fill: "#2a364b".into(),
                stroke: "#3e5272".into(),
                rail: "#4c8dff".into(),
                eyebrow: "#ff8f5d".into(),
                time: "#f5f8ff".into(),
                label: "#a9bad1".into(),
                rail_muted: "#3b4c66".into(),
                text_muted: "#7f90a8".into(),
            },
        };

        let json = serde_json::to_string(&palettes).unwrap();

        assert_eq!(
            json,
            r##"{"light":{"fill":"#ffffff","stroke":"#dfe5ee","rail":"#002244","eyebrow":"#b7541e","time":"#1a1a1a","label":"#5a6a80","railMuted":"#aab4c2","textMuted":"#5a6a80"},"dark":{"fill":"#2a364b","stroke":"#3e5272","rail":"#4c8dff","eyebrow":"#ff8f5d","time":"#f5f8ff","label":"#a9bad1","railMuted":"#3b4c66","textMuted":"#7f90a8"}}"##
        );
    }

    #[test]
    fn a_null_theme_round_trips_as_explicit_json_null() {
        let event = AlarmNextChanged {
            alarm: None,
            is_24_hour: None,
            theme: None,
        };

        let json = serde_json::to_string(&event).unwrap();

        assert_eq!(json, r#"{"alarm":null,"is24Hour":null,"theme":null}"#);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alarm_fired_defaults_handled_natively_when_absent() {
        // Shape predating issue #255's Phase 3 -- no `handledNatively` key at all, the
        // exact case desktop (no native bus) and any pre-upgrade queued event hit.
        let json = r#"{
            "id": 7,
            "triggerAt": 1000,
            "actualFiredAt": 1005,
            "label": "Wake up",
            "revision": 3
        }"#;

        let event: AlarmFired =
            serde_json::from_str(json).expect("old-shape payload should deserialize");

        assert!(event.handled_natively.is_empty());
        // The other pre-existing `#[serde(default = ...)]` fields should still fall back too.
        assert_eq!(event.snooze_length_minutes, 10);
        assert!(!event.is_24_hour);
        assert!(!event.is_24_hour_known);
    }

    #[test]
    fn alarm_fired_round_trips_handled_natively_when_present() {
        let json = r#"{
            "id": 7,
            "triggerAt": 1000,
            "actualFiredAt": 1005,
            "label": "Wake up",
            "revision": 3,
            "handledNatively": ["watch-ring"]
        }"#;

        let event: AlarmFired =
            serde_json::from_str(json).expect("new-shape payload should deserialize");

        assert_eq!(event.handled_natively, vec!["watch-ring".to_string()]);
    }
}
