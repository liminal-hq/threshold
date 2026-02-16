use crate::error::{ConflictError, Result};

/// Validate that the watch's revision is current enough to make changes.
///
/// The watch must be at the same revision as the phone to ensure it has
/// seen all recent changes before submitting edits. If the watch is behind,
/// a `StaleUpdate` conflict is returned — the watch should re-sync and
/// retry.
pub fn validate_watch_revision(watch_revision: i64, current_revision: i64) -> Result<()> {
    if watch_revision < current_revision {
        return Err(ConflictError::StaleUpdate {
            watch_revision,
            current_revision,
        }
        .into());
    }
    Ok(())
}

/// Validate that a specific alarm has not been modified since the watch
/// last synced.
///
/// If the alarm's revision is newer than the watch's known revision, the
/// alarm was changed on the phone after the watch's last sync — the edit
/// from the watch would overwrite those changes. Returns `AlarmModified`
/// so the watch can re-sync before retrying.
pub fn validate_alarm_update(
    alarm_id: i32,
    alarm_revision: i64,
    watch_revision: i64,
) -> Result<()> {
    if alarm_revision > watch_revision {
        return Err(ConflictError::AlarmModified {
            alarm_id,
            alarm_revision,
            watch_revision,
        }
        .into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ConflictError;

    // ── validate_watch_revision ──────────────────────────────────────

    #[test]
    fn accepts_matching_revision() {
        assert!(validate_watch_revision(42, 42).is_ok());
    }

    #[test]
    fn accepts_watch_ahead_of_phone() {
        // Unusual but not a conflict — phone may have reset.
        // The sync protocol handles this via FullSync; the conflict
        // detector only guards edits.
        assert!(validate_watch_revision(50, 42).is_ok());
    }

    #[test]
    fn rejects_stale_watch() {
        let err = validate_watch_revision(40, 42).unwrap_err();
        match err {
            crate::error::Error::Conflict(ConflictError::StaleUpdate {
                watch_revision,
                current_revision,
            }) => {
                assert_eq!(watch_revision, 40);
                assert_eq!(current_revision, 42);
            }
            other => panic!("Expected StaleUpdate, got: {other:?}"),
        }
    }

    #[test]
    fn rejects_stale_watch_by_one() {
        assert!(validate_watch_revision(41, 42).is_err());
    }

    // ── validate_alarm_update ────────────────────────────────────────

    #[test]
    fn accepts_alarm_at_watch_revision() {
        assert!(validate_alarm_update(1, 42, 42).is_ok());
    }

    #[test]
    fn accepts_alarm_older_than_watch() {
        assert!(validate_alarm_update(1, 30, 42).is_ok());
    }

    #[test]
    fn rejects_alarm_modified_after_watch_sync() {
        let err = validate_alarm_update(7, 45, 42).unwrap_err();
        match err {
            crate::error::Error::Conflict(ConflictError::AlarmModified {
                alarm_id,
                alarm_revision,
                watch_revision,
            }) => {
                assert_eq!(alarm_id, 7);
                assert_eq!(alarm_revision, 45);
                assert_eq!(watch_revision, 42);
            }
            other => panic!("Expected AlarmModified, got: {other:?}"),
        }
    }

    #[test]
    fn rejects_alarm_modified_by_one_revision() {
        assert!(validate_alarm_update(1, 43, 42).is_err());
    }
}
