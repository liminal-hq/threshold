// Wire models for the home-widgets plugin's event payloads
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{Deserialize, Serialize};

/// The next-alarm summary carried by the core `alarm:next-changed` event, as emitted by the app's scheduler. `alarm` is `None` when no alarm is scheduled; `is24Hour` mirrors the user's clock-format preference at the time of the change. Deserialize-only: this struct mirrors a subset of the event's fields, and serde ignores unknown fields by default, so it stays tolerant of fields this plugin doesn't care about.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextAlarmSnapshot {
    pub alarm: Option<NextAlarmInfo>,
    pub is_24_hour: Option<bool>,
    /// The app-theme palette pair, deserialized opaquely -- this plugin doesn't interpret theme roles, it just forwards the sub-object on to Kotlin as a serialized string. `None` means "not pushed yet" (the startup seed emission fires before the webview loads); Kotlin must keep its last persisted theme in that case, never clear it.
    pub theme: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextAlarmInfo {
    pub id: i32,
    pub label: Option<String>,
    pub trigger_at: i64,
}

/// The flat, Kotlin-bound payload sent to `HomeWidgetsPlugin.updateWidgetSnapshot` -- flattened from [`NextAlarmSnapshot`] because the native widget's remote view binding reads a single flat object rather than a nested one.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSnapshotPayload {
    pub alarm_id: Option<i32>,
    pub label: Option<String>,
    pub trigger_at: Option<i64>,
    pub is_24_hour: Option<bool>,
    /// The theme sub-object serialized to a compact JSON string -- a string because Kotlin's `@InvokeArg` binding is only proven for flat scalar fields in this codebase. `None` when the event carried no theme.
    pub theme_json: Option<String>,
}

/// Serializes the theme sub-object to a compact JSON string, or `None` when absent. Serialization of an already-parsed `serde_json::Value` back to a string is infallible, so this never fails in practice.
fn serialize_theme(theme: Option<serde_json::Value>) -> Option<String> {
    theme.map(|value| value.to_string())
}

impl From<NextAlarmSnapshot> for WidgetSnapshotPayload {
    fn from(snapshot: NextAlarmSnapshot) -> Self {
        let theme_json = serialize_theme(snapshot.theme);
        match snapshot.alarm {
            Some(alarm) => WidgetSnapshotPayload {
                alarm_id: Some(alarm.id),
                label: alarm.label,
                trigger_at: Some(alarm.trigger_at),
                is_24_hour: snapshot.is_24_hour,
                theme_json,
            },
            None => WidgetSnapshotPayload {
                alarm_id: None,
                label: None,
                trigger_at: None,
                is_24_hour: snapshot.is_24_hour,
                theme_json,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_theme_json() -> &'static str {
        r##"{
            "light": { "fill": "#ffffff", "stroke": "#dfe5ee", "rail": "#002244", "eyebrow": "#b7541e", "time": "#1a1a1a", "label": "#5a6a80", "railMuted": "#aab4c2", "textMuted": "#5a6a80" },
            "dark": { "fill": "#2a364b", "stroke": "#3e5272", "rail": "#4c8dff", "eyebrow": "#ff8f5d", "time": "#f5f8ff", "label": "#a9bad1", "railMuted": "#3b4c66", "textMuted": "#7f90a8" }
        }"##
    }

    #[test]
    fn next_alarm_snapshot_deserializes_the_populated_wire_shape() {
        let json = format!(
            r#"{{
            "alarm": {{ "id": 3, "label": "Weekday Alarm", "triggerAt": 1755500040000 }},
            "is24Hour": true,
            "theme": {}
        }}"#,
            sample_theme_json()
        );

        let snapshot: NextAlarmSnapshot = serde_json::from_str(&json).expect("should deserialize");

        let alarm = snapshot.alarm.expect("alarm should be present");
        assert_eq!(alarm.id, 3);
        assert_eq!(alarm.label.as_deref(), Some("Weekday Alarm"));
        assert_eq!(alarm.trigger_at, 1755500040000);
        assert_eq!(snapshot.is_24_hour, Some(true));
        assert!(snapshot.theme.is_some());
    }

    #[test]
    fn next_alarm_snapshot_deserializes_the_all_null_wire_shape() {
        let json = r#"{ "alarm": null, "is24Hour": null, "theme": null }"#;

        let snapshot: NextAlarmSnapshot = serde_json::from_str(json).expect("should deserialize");

        assert!(snapshot.alarm.is_none());
        assert_eq!(snapshot.is_24_hour, None);
        assert!(snapshot.theme.is_none());
    }

    #[test]
    fn widget_snapshot_payload_serializes_to_the_flat_camel_case_wire_shape() {
        let payload = WidgetSnapshotPayload {
            alarm_id: Some(3),
            label: Some("Weekday Alarm".to_string()),
            trigger_at: Some(1755500040000),
            is_24_hour: Some(true),
            theme_json: Some(r#"{"light":{},"dark":{}}"#.to_string()),
        };

        let json = serde_json::to_string(&payload).expect("should serialize");

        assert_eq!(
            json,
            r#"{"alarmId":3,"label":"Weekday Alarm","triggerAt":1755500040000,"is24Hour":true,"themeJson":"{\"light\":{},\"dark\":{}}"}"#
        );
    }

    #[test]
    fn widget_snapshot_payload_serializes_the_all_null_wire_shape() {
        let payload = WidgetSnapshotPayload {
            alarm_id: None,
            label: None,
            trigger_at: None,
            is_24_hour: None,
            theme_json: None,
        };

        let json = serde_json::to_string(&payload).expect("should serialize");

        assert_eq!(
            json,
            r#"{"alarmId":null,"label":null,"triggerAt":null,"is24Hour":null,"themeJson":null}"#
        );
    }

    #[test]
    fn next_alarm_snapshot_flattens_into_widget_snapshot_payload() {
        let snapshot = NextAlarmSnapshot {
            alarm: Some(NextAlarmInfo {
                id: 3,
                label: Some("Weekday Alarm".to_string()),
                trigger_at: 1755500040000,
            }),
            is_24_hour: Some(true),
            theme: None,
        };

        let payload: WidgetSnapshotPayload = snapshot.into();

        assert_eq!(payload.alarm_id, Some(3));
        assert_eq!(payload.label.as_deref(), Some("Weekday Alarm"));
        assert_eq!(payload.trigger_at, Some(1755500040000));
        assert_eq!(payload.is_24_hour, Some(true));
        assert_eq!(payload.theme_json, None);
    }

    #[test]
    fn next_alarm_snapshot_flattens_the_theme_into_an_exact_json_string() {
        let theme_value: serde_json::Value =
            serde_json::from_str(sample_theme_json()).expect("theme fixture should parse");
        let snapshot = NextAlarmSnapshot {
            alarm: None,
            is_24_hour: None,
            theme: Some(theme_value.clone()),
        };

        let payload: WidgetSnapshotPayload = snapshot.into();

        let expected = serde_json::to_string(&theme_value).expect("theme should serialize");
        assert_eq!(payload.theme_json, Some(expected));
    }

    #[test]
    fn next_alarm_snapshot_with_no_theme_flattens_to_a_null_theme_json() {
        let snapshot = NextAlarmSnapshot {
            alarm: None,
            is_24_hour: None,
            theme: None,
        };

        let payload: WidgetSnapshotPayload = snapshot.into();

        assert_eq!(payload.theme_json, None);
    }
}
