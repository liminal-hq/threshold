// Wire models for the home-widgets plugin's event payloads
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{Deserialize, Serialize};

/// The next-alarm summary carried by the core `alarm:next-changed` event, as emitted by
/// the app's scheduler. `alarm` is `None` when no alarm is scheduled; `is24Hour` mirrors
/// the user's clock-format preference at the time of the change. Deserialize-only: this
/// struct mirrors a subset of the event's fields, and serde ignores unknown fields by
/// default, so it stays tolerant of fields this plugin doesn't care about.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextAlarmSnapshot {
    pub alarm: Option<NextAlarmInfo>,
    pub is_24_hour: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextAlarmInfo {
    pub id: i32,
    pub label: Option<String>,
    pub trigger_at: i64,
}

/// The flat, Kotlin-bound payload sent to `HomeWidgetsPlugin.updateWidgetSnapshot` --
/// flattened from [`NextAlarmSnapshot`] because the native widget's remote view binding
/// reads a single flat object rather than a nested one.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSnapshotPayload {
    pub alarm_id: Option<i32>,
    pub label: Option<String>,
    pub trigger_at: Option<i64>,
    pub is_24_hour: Option<bool>,
}

impl From<NextAlarmSnapshot> for WidgetSnapshotPayload {
    fn from(snapshot: NextAlarmSnapshot) -> Self {
        match snapshot.alarm {
            Some(alarm) => WidgetSnapshotPayload {
                alarm_id: Some(alarm.id),
                label: alarm.label,
                trigger_at: Some(alarm.trigger_at),
                is_24_hour: snapshot.is_24_hour,
            },
            None => WidgetSnapshotPayload {
                alarm_id: None,
                label: None,
                trigger_at: None,
                is_24_hour: snapshot.is_24_hour,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_alarm_snapshot_deserializes_the_populated_wire_shape() {
        let json = r#"{
            "alarm": { "id": 3, "label": "Weekday Alarm", "triggerAt": 1755500040000 },
            "is24Hour": true
        }"#;

        let snapshot: NextAlarmSnapshot = serde_json::from_str(json).expect("should deserialize");

        let alarm = snapshot.alarm.expect("alarm should be present");
        assert_eq!(alarm.id, 3);
        assert_eq!(alarm.label.as_deref(), Some("Weekday Alarm"));
        assert_eq!(alarm.trigger_at, 1755500040000);
        assert_eq!(snapshot.is_24_hour, Some(true));
    }

    #[test]
    fn next_alarm_snapshot_deserializes_the_all_null_wire_shape() {
        let json = r#"{ "alarm": null, "is24Hour": null }"#;

        let snapshot: NextAlarmSnapshot = serde_json::from_str(json).expect("should deserialize");

        assert!(snapshot.alarm.is_none());
        assert_eq!(snapshot.is_24_hour, None);
    }

    #[test]
    fn widget_snapshot_payload_serializes_to_the_flat_camel_case_wire_shape() {
        let payload = WidgetSnapshotPayload {
            alarm_id: Some(3),
            label: Some("Weekday Alarm".to_string()),
            trigger_at: Some(1755500040000),
            is_24_hour: Some(true),
        };

        let json = serde_json::to_string(&payload).expect("should serialize");

        assert_eq!(
            json,
            r#"{"alarmId":3,"label":"Weekday Alarm","triggerAt":1755500040000,"is24Hour":true}"#
        );
    }

    #[test]
    fn widget_snapshot_payload_serializes_the_all_null_wire_shape() {
        let payload = WidgetSnapshotPayload {
            alarm_id: None,
            label: None,
            trigger_at: None,
            is_24_hour: None,
        };

        let json = serde_json::to_string(&payload).expect("should serialize");

        assert_eq!(
            json,
            r#"{"alarmId":null,"label":null,"triggerAt":null,"is24Hour":null}"#
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
        };

        let payload: WidgetSnapshotPayload = snapshot.into();

        assert_eq!(payload.alarm_id, Some(3));
        assert_eq!(payload.label.as_deref(), Some("Weekday Alarm"));
        assert_eq!(payload.trigger_at, Some(1755500040000));
        assert_eq!(payload.is_24_hour, Some(true));
    }
}
