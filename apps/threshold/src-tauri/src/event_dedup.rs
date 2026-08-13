// Bounded recent-eventId dedup shared across the native event listeners in lib.rs
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::collections::VecDeque;
use std::sync::Mutex;

/// Capacity of the recent-eventId ring buffer -- sized comfortably above the number of
/// events that could plausibly be redelivered from a single crash-window replay (see
/// `EventDedup`'s own docs for the failure mode this guards against).
const CAPACITY: usize = 32;

/// A small, shared, last-N `eventId` dedup buffer for the six native event listeners
/// wired up in `lib.rs` (`wear:alarm:dismiss`, `wear:alarm:snooze`,
/// `alarm-manager:native-fired`, `alarm-manager:dismiss-requested`,
/// `alarm-manager:snooze-requested`, `alarm-manager:import-requested`).
///
/// Stage 2's `DurableEventQueue` drain (see `drainAndDispatch` in
/// `plugins/alarm-manager/android/.../AlarmManagerPlugin.kt`, not part of this crate)
/// commits successfully-delivered entries only *after* Channel delivery succeeds -- a
/// deliberate design decision, already reviewed -- so a crash in the narrow window
/// between a successful delivery and the trailing commit can redeliver the same event
/// on the next drain. The `"watch-ring"` tag in `AlarmFired::handled_natively` already
/// prevents a double watch *ring* for the fired case specifically, but without this
/// buffer a redelivered event would still re-run whatever UI/toast paths listen for
/// these Tauri events app-wide (e.g. a second dismiss/snooze toast for the same action).
///
/// Events with no `eventId` (payloads predating this change, or any source that doesn't
/// carry one yet) always report as "not a duplicate" -- there is nothing to key a dedup
/// check on, so they are let through rather than dropped or misclassified.
pub struct EventDedup {
    recent: Mutex<VecDeque<String>>,
}

impl EventDedup {
    /// Creates an empty dedup buffer.
    pub fn new() -> Self {
        Self {
            recent: Mutex::new(VecDeque::with_capacity(CAPACITY)),
        }
    }

    /// Checks whether `event_id` has already been seen and records it if not.
    ///
    /// Returns `true` when this is a duplicate (already seen within the buffer's
    /// window, so the caller should treat it as a no-op) and `false` otherwise --
    /// including whenever `event_id` is `None`, which is never treated as a duplicate
    /// of anything.
    pub fn is_duplicate(&self, event_id: Option<&str>) -> bool {
        let Some(event_id) = event_id else {
            return false;
        };

        // A poisoned lock (a panic while held elsewhere) shouldn't take dedup down with
        // it -- recover the inner buffer and carry on, same as `AlarmCoordinator`'s own
        // approach to non-critical shared state elsewhere in this crate.
        let mut recent = self
            .recent
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if recent.iter().any(|seen| seen == event_id) {
            return true;
        }

        if recent.len() >= CAPACITY {
            recent.pop_front();
        }
        recent.push_back(event_id.to_string());
        false
    }
}

impl Default for EventDedup {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_occurrence_is_not_a_duplicate() {
        let dedup = EventDedup::new();
        assert!(!dedup.is_duplicate(Some("a")));
    }

    #[test]
    fn second_occurrence_of_the_same_id_is_a_duplicate() {
        let dedup = EventDedup::new();
        assert!(!dedup.is_duplicate(Some("a")));
        assert!(dedup.is_duplicate(Some("a")));
    }

    #[test]
    fn distinct_ids_are_each_seen_as_new() {
        let dedup = EventDedup::new();
        assert!(!dedup.is_duplicate(Some("a")));
        assert!(!dedup.is_duplicate(Some("b")));
        assert!(dedup.is_duplicate(Some("a")));
        assert!(dedup.is_duplicate(Some("b")));
    }

    #[test]
    fn buffer_evicts_oldest_entry_past_capacity() {
        let dedup = EventDedup::new();
        for i in 0..CAPACITY {
            assert!(!dedup.is_duplicate(Some(&i.to_string())));
        }
        // Buffer is now exactly full (ids "0".."CAPACITY - 1"). One more distinct id
        // pushes out the oldest entry ("0").
        assert!(!dedup.is_duplicate(Some("overflow")));
        // "0" was evicted, so it's treated as new again rather than a duplicate.
        assert!(!dedup.is_duplicate(Some("0")));
        // The most recently seen id from the initial fill hasn't been evicted yet.
        assert!(dedup.is_duplicate(Some(&(CAPACITY - 1).to_string())));
    }

    #[test]
    fn missing_event_id_is_never_a_duplicate() {
        let dedup = EventDedup::new();
        assert!(!dedup.is_duplicate(None));
        assert!(!dedup.is_duplicate(None));
        // Doesn't pollute the buffer either -- a real id afterwards is still fresh.
        assert!(!dedup.is_duplicate(Some("a")));
    }
}
