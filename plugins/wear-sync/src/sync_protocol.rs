use serde::{Deserialize, Serialize};

/// Maximum revision gap for an incremental (delta) sync.
/// Gaps larger than this trigger a full sync to avoid transmitting
/// too many individual changes over the Wear Data Layer.
const INCREMENTAL_THRESHOLD: i64 = 100;

/// The type of sync to perform based on the revision gap.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncType {
    /// Watch is already up to date — no data transfer needed.
    UpToDate,
    /// Small gap — send only the changed and deleted alarms.
    Incremental,
    /// Large gap or anomaly — send the entire alarm set.
    FullSync,
}

/// Determine the sync type from the watch's last-known revision
/// and the phone's current revision.
///
/// - Same revision → `UpToDate`
/// - Watch ahead of phone (anomaly, e.g. data wipe) → `FullSync`
/// - Gap 1–100 → `Incremental`
/// - Gap >100 → `FullSync`
pub fn determine_sync_type(watch_revision: i64, current_revision: i64) -> SyncType {
    if watch_revision == current_revision {
        SyncType::UpToDate
    } else if watch_revision > current_revision {
        // Anomaly: watch thinks it's ahead of phone (e.g. phone data reset).
        // Force a full sync to re-establish ground truth.
        SyncType::FullSync
    } else if current_revision - watch_revision <= INCREMENTAL_THRESHOLD {
        SyncType::Incremental
    } else {
        SyncType::FullSync
    }
}

/// The response payload sent to the watch after a sync request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncResponse {
    /// Watch is already at the latest revision.
    UpToDate {
        current_revision: i64,
    },
    /// Delta update: only the alarms that changed plus deleted IDs.
    Incremental {
        current_revision: i64,
        updated_alarms: Vec<serde_json::Value>,
        deleted_alarm_ids: Vec<i32>,
    },
    /// Complete replacement: all active alarms.
    FullSync {
        current_revision: i64,
        all_alarms: Vec<serde_json::Value>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn up_to_date_when_revisions_match() {
        assert_eq!(determine_sync_type(42, 42), SyncType::UpToDate);
    }

    #[test]
    fn up_to_date_at_zero() {
        assert_eq!(determine_sync_type(0, 0), SyncType::UpToDate);
    }

    #[test]
    fn incremental_for_small_gap() {
        assert_eq!(determine_sync_type(40, 42), SyncType::Incremental);
    }

    #[test]
    fn incremental_at_gap_of_one() {
        assert_eq!(determine_sync_type(41, 42), SyncType::Incremental);
    }

    #[test]
    fn incremental_at_exact_threshold() {
        assert_eq!(determine_sync_type(0, 100), SyncType::Incremental);
    }

    #[test]
    fn full_sync_beyond_threshold() {
        assert_eq!(determine_sync_type(0, 101), SyncType::FullSync);
    }

    #[test]
    fn full_sync_large_gap() {
        assert_eq!(determine_sync_type(5, 500), SyncType::FullSync);
    }

    #[test]
    fn full_sync_when_watch_ahead_of_phone() {
        // Anomaly: watch has a higher revision than phone (e.g. phone data reset)
        assert_eq!(determine_sync_type(50, 10), SyncType::FullSync);
    }

    #[test]
    fn sync_response_serialises_up_to_date() {
        let response = SyncResponse::UpToDate { current_revision: 42 };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"type\":\"UP_TO_DATE\""));
        assert!(json.contains("\"current_revision\":42"));
    }

    #[test]
    fn sync_response_serialises_incremental() {
        let response = SyncResponse::Incremental {
            current_revision: 50,
            updated_alarms: vec![serde_json::json!({"id": 1, "label": "Test"})],
            deleted_alarm_ids: vec![3, 7],
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"type\":\"INCREMENTAL\""));
        assert!(json.contains("\"deleted_alarm_ids\":[3,7]"));
    }

    #[test]
    fn sync_response_serialises_full_sync() {
        let response = SyncResponse::FullSync {
            current_revision: 100,
            all_alarms: vec![],
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"type\":\"FULL_SYNC\""));
        assert!(json.contains("\"all_alarms\":[]"));
    }

    #[test]
    fn sync_response_round_trips_through_json() {
        let original = SyncResponse::Incremental {
            current_revision: 25,
            updated_alarms: vec![serde_json::json!({"id": 5})],
            deleted_alarm_ids: vec![2],
        };
        let json = serde_json::to_string(&original).unwrap();
        let deserialized: SyncResponse = serde_json::from_str(&json).unwrap();

        match deserialized {
            SyncResponse::Incremental {
                current_revision,
                updated_alarms,
                deleted_alarm_ids,
            } => {
                assert_eq!(current_revision, 25);
                assert_eq!(updated_alarms.len(), 1);
                assert_eq!(deleted_alarm_ids, vec![2]);
            }
            _ => panic!("Expected Incremental variant"),
        }
    }
}
