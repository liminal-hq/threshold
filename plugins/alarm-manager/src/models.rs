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
    /// The `DurableEventQueue` envelope's UUID for this event, stable across the immediate
    /// Channel send and a later retry of the same queued entry (see
    /// `AlarmManagerPlugin.enrichPayloadForDispatch` on the Kotlin side). `#[serde(default)]`
    /// so this deserializes cleanly from a payload queued before this field existed.
    #[serde(default)]
    pub event_id: Option<String>,
    /// Side-effect tags `NativeEventBus.publish()`'s listeners reported handling this event
    /// with before Rust ever saw it (e.g. `"watch-ring"`). `#[serde(default)]` for the same
    /// pre-upgrade-payload reason as `event_id`. See
    /// docs/architecture/255-phase3-payload-contract.md for the frozen shape.
    #[serde(default)]
    pub handled_natively: Vec<String>,
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

/// Request payload for Kotlin's `stopRinging` command. `alarm_id`, when known, threads the
/// real alarm id through to `AlarmRingingService`'s `ACTION_DISMISS` intent so
/// `AlarmManagerPlugin.notifyAlarmDismissed` gets a usable id for every dismiss origin --
/// previously only the notification's own Dismiss action carried one, so in-app dismiss
/// silently produced no native event at all (issue #255 Phase 4A). `None` for callers that
/// don't know which alarm they're stopping: the legacy ID-less JS notification-action
/// fallback, and in-app snooze (`stop_ringing`'s single command is shared between dismiss and
/// snooze, so threading an id through for a snooze would misattribute it as a dismiss -- see
/// `resolveStopRingingAlarmId`'s KDoc on the Kotlin side for the full reasoning). Omitted (not
/// sent as JSON `null`) when absent, same reasoning as `PickAlarmSoundOptions` above: Kotlin's
/// `StopRingingArgs` arg class expects the key to be missing for "no explicit id", not
/// present-but-null.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopRingingRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alarm_id: Option<i32>,
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

    #[test]
    fn native_alarm_fired_payload_deserializes_old_two_field_shape_with_serde_defaults() {
        // Issue #255 Phase 3A added event_id/handled_natively to this struct. A payload sitting
        // in a device's DurableEventQueue from before the update ships (or emitted by a desktop
        // build, which never sets them) still carries only the original two fields -- this must
        // keep deserializing rather than erroring, with the new fields defaulting to
        // None/empty per docs/architecture/255-phase3-payload-contract.md.
        let json = r#"{"id": 42, "actualFiredAt": 1755100800000}"#;

        let payload: NativeAlarmFiredPayload =
            serde_json::from_str(json).expect("should deserialize old-shape payload");

        assert_eq!(payload.id, 42);
        assert_eq!(payload.actual_fired_at, 1755100800000);
        assert_eq!(payload.event_id, None);
        assert!(payload.handled_natively.is_empty());
    }

    #[test]
    fn native_alarm_fired_payload_deserializes_new_shape_with_event_id_and_handled_natively() {
        // Mirrors the exact JSON AlarmManagerPlugin.kt's enrichPayloadForDispatch now sends for
        // the fired-event Channel/queue payload -- see the frozen contract doc's example.
        let json = r#"{
            "id": 123,
            "actualFiredAt": 1755100800000,
            "eventId": "b3f1c2a4-0000-0000-0000-000000000000",
            "handledNatively": ["watch-ring"]
        }"#;

        let payload: NativeAlarmFiredPayload =
            serde_json::from_str(json).expect("should deserialize new-shape payload");

        assert_eq!(payload.id, 123);
        assert_eq!(payload.actual_fired_at, 1755100800000);
        assert_eq!(
            payload.event_id,
            Some("b3f1c2a4-0000-0000-0000-000000000000".to_string())
        );
        assert_eq!(payload.handled_natively, vec!["watch-ring".to_string()]);
    }
}
