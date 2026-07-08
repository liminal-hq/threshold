// Computes the next alarm trigger timestamp for fixed and window alarm modes
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use chrono::{Datelike, Local, NaiveTime, Timelike};
use chrono::{DateTime, TimeZone};
use rand::Rng;
use crate::alarm::{models::*, error::Result};

/// Minimum lead time when sampling inside an already-open window, so the
/// alarm never fires "immediately" the moment it's enabled.
const MIN_LEAD_SECONDS: i64 = 30;

/// Distinguishes a fresh "what should fire next, from right now" query from
/// a "what's next after this specific occurrence" query (used after a
/// dismiss/re-arm). Only the former may sample the remaining time of a
/// window that has already started — the latter must treat that window as
/// spent and look ahead to the next occurrence.
#[derive(Clone, Copy, PartialEq)]
enum ReferenceKind {
    Fresh,
    AfterOccurrence,
}

/// Calculate next trigger timestamp for an alarm
pub fn calculate_next_trigger(alarm: &AlarmInput) -> Result<Option<i64>> {
    calculate_next_trigger_from(alarm, Local::now(), ReferenceKind::Fresh)
}

/// Calculate next trigger timestamp for an alarm after a given reference instant.
pub fn calculate_next_trigger_after(alarm: &AlarmInput, after_ms: i64) -> Result<Option<i64>> {
    let reference = Local
        .timestamp_millis_opt(after_ms)
        .single()
        .ok_or("Invalid reference timestamp")?;
    calculate_next_trigger_from(alarm, reference, ReferenceKind::AfterOccurrence)
}

fn calculate_next_trigger_from(
    alarm: &AlarmInput,
    now: DateTime<Local>,
    kind: ReferenceKind,
) -> Result<Option<i64>> {
    if !alarm.enabled {
        return Ok(None);
    }

    match alarm.mode {
        AlarmMode::Fixed => {
            let time = alarm.fixed_time.as_ref()
                .ok_or("Fixed alarm missing fixedTime")?;
            calculate_fixed_trigger(time, &alarm.active_days, now)
        },
        AlarmMode::Window => {
            let start = alarm.window_start.as_ref()
                .ok_or("Window alarm missing windowStart")?;
            let end = alarm.window_end.as_ref()
                .ok_or("Window alarm missing windowEnd")?;
            calculate_window_trigger(start, end, &alarm.active_days, now, kind)
        },
    }
}

fn calculate_fixed_trigger(
    time_str: &str,
    active_days: &[i32],
    now: DateTime<Local>,
) -> Result<Option<i64>> {
    let target_time = NaiveTime::parse_from_str(time_str, "%H:%M")?;

    // Find next occurrence in active days
    for days_ahead in 0..8 {
        let candidate = now + chrono::Duration::days(days_ahead);
        let weekday = candidate.weekday().num_days_from_sunday() as i32;

        if active_days.contains(&weekday) {
            // Use earliest() to handle DST fallback safely (pick the first occurrence)
            // If None (invalid time), continue to next day
            if let Some(candidate_dt) = candidate
                .date_naive()
                .and_time(target_time)
                .and_local_timezone(Local)
                .earliest()
            {
                if candidate_dt > now {
                    return Ok(Some(candidate_dt.timestamp_millis()));
                }
            }
        }
    }

    // No active days found in next week
    Ok(None)
}

fn calculate_window_trigger(
    start_str: &str,
    end_str: &str,
    active_days: &[i32],
    now: DateTime<Local>,
    kind: ReferenceKind,
) -> Result<Option<i64>> {
    let start_time = NaiveTime::parse_from_str(start_str, "%H:%M")?;
    let end_time = NaiveTime::parse_from_str(end_str, "%H:%M")?;

    if start_time == end_time {
        return Err("Window end must differ from start".into());
    }
    // If end <= start, the window crosses midnight (e.g. 23:00 -> 01:00);
    // its end falls on the day after whichever day it starts on.
    let crosses_midnight = end_time <= start_time;

    // Overnight windows: "now" might already be inside the tail end of a
    // window that started yesterday (e.g. it's 00:30 and yesterday's
    // 23:00-01:00 window is still open). Only a fresh query may resample
    // that remaining time; prefer it over jumping to the next occurrence.
    if crosses_midnight && kind == ReferenceKind::Fresh {
        let yesterday = now - chrono::Duration::days(1);
        let yesterday_weekday = yesterday.weekday().num_days_from_sunday() as i32;
        if active_days.contains(&yesterday_weekday) {
            if let Some(trigger) =
                sample_window_for_day(yesterday, start_time, end_time, true, now, kind)?
            {
                return Ok(Some(trigger));
            }
        }
    }

    // Find next occurrence
    for days_ahead in 0..8 {
        let candidate = now + chrono::Duration::days(days_ahead);
        let weekday = candidate.weekday().num_days_from_sunday() as i32;

        if active_days.contains(&weekday) {
            if let Some(trigger) = sample_window_for_day(
                candidate,
                start_time,
                end_time,
                crosses_midnight,
                now,
                kind,
            )? {
                return Ok(Some(trigger));
            }
        }
    }

    Ok(None)
}

/// Try to sample a trigger from the window instance that starts on `candidate`'s date.
fn sample_window_for_day(
    candidate: DateTime<Local>,
    start_time: NaiveTime,
    end_time: NaiveTime,
    crosses_midnight: bool,
    now: DateTime<Local>,
    kind: ReferenceKind,
) -> Result<Option<i64>> {
    // Use earliest() to handle DST fallback safely
    let Some(window_start) = candidate
        .date_naive()
        .and_time(start_time)
        .and_local_timezone(Local)
        .earliest()
    else {
        return Ok(None);
    };

    let end_date = if crosses_midnight {
        candidate.date_naive() + chrono::Duration::days(1)
    } else {
        candidate.date_naive()
    };
    let Some(window_end) = end_date
        .and_time(end_time)
        .and_local_timezone(Local)
        .earliest()
    else {
        return Ok(None);
    };

    if window_end <= now {
        // This occurrence has already fully elapsed.
        return Ok(None);
    }

    let sample_start = match kind {
        ReferenceKind::Fresh if window_start <= now => {
            // Already inside the window: sample the remaining time, with a
            // small lead so the alarm never fires "immediately".
            std::cmp::max(now + chrono::Duration::seconds(MIN_LEAD_SECONDS), window_start)
        }
        _ if window_start > now => window_start,
        // Not eligible for in-progress sampling and the window has already
        // started (e.g. right after a dismissal) — this occurrence is
        // spent; the caller moves on to the next active day.
        _ => return Ok(None),
    };

    if sample_start >= window_end {
        return Ok(None);
    }

    // Pick a random minute within the window so the alarm always fires at
    // the top of the minute (:00 seconds). The end bound is exclusive.
    let sample_start_minute = ceil_to_minute(sample_start);
    let window_end_minute = floor_to_minute(window_end - chrono::Duration::milliseconds(1));

    if sample_start_minute > window_end_minute {
        return Ok(None);
    }

    let span_mins = window_end_minute
        .signed_duration_since(sample_start_minute)
        .num_minutes();
    let random_offset_mins = rand::thread_rng().gen_range(0..=span_mins);
    let trigger = sample_start_minute + chrono::Duration::minutes(random_offset_mins);

    Ok(Some(trigger.timestamp_millis()))
}

fn floor_to_minute(dt: DateTime<Local>) -> DateTime<Local> {
    dt - chrono::Duration::seconds(dt.second() as i64)
        - chrono::Duration::nanoseconds(dt.nanosecond() as i64)
}

fn ceil_to_minute(dt: DateTime<Local>) -> DateTime<Local> {
    let floored = floor_to_minute(dt);
    if floored < dt {
        floored + chrono::Duration::minutes(1)
    } else {
        floored
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, DateTime};

    #[test]
    fn test_fixed_alarm_calculation() {
        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("09:00".into()),
            active_days: vec![1, 2, 3, 4, 5], // Weekdays
            ..Default::default()
        };

        let trigger = calculate_next_trigger(&input).unwrap();
        assert!(trigger.is_some());
    }

    #[test]
    fn test_window_randomization() {
        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Window,
            window_start: Some("07:00".into()),
            window_end: Some("07:30".into()),
            active_days: vec![1, 2, 3, 4, 5],
            ..Default::default()
        };

        let trigger = calculate_next_trigger(&input).unwrap().unwrap();

        // Verify trigger is in the future
        let now = Local::now().timestamp_millis();
        assert!(trigger > now);

        // Run multiple times to verify randomness
        let _trigger2 = calculate_next_trigger(&input).unwrap().unwrap();
        // Note: Could be same due to same day, but algorithm is random
    }

    #[test]
    fn test_disabled_alarm() {
        let input = AlarmInput {
            enabled: false,
            ..Default::default()
        };

        let trigger = calculate_next_trigger(&input).unwrap();
        assert!(trigger.is_none());
    }

    #[test]
    fn test_recurrence_wrap_around() {
        let now = Local::now();
        // Calculate a day 2 days ago to ensure we look forward
        let past_day = (now.weekday().num_days_from_sunday() as i32 + 7 - 2) % 7;

        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("12:00".into()),
            active_days: vec![past_day],
            ..Default::default()
        };

        let trigger_ts = calculate_next_trigger(&input).unwrap().unwrap();
        let trigger_dt = DateTime::from_timestamp_millis(trigger_ts).unwrap().with_timezone(&Local);

        assert!(trigger_dt > now);

        // Should be next week (5 days from now roughly)
        // We expect it to be 5 days ahead
        let diff = trigger_dt.signed_duration_since(now);
        assert!(diff.num_days() >= 4); // At least 4 full days
    }

    #[test]
    fn test_recurrence_nearest_day() {
        let now = Local::now();
        let today_idx = now.weekday().num_days_from_sunday() as i32;

        // Create active days: today + 2 days, and today + 5 days
        let day1 = (today_idx + 2) % 7;
        let day2 = (today_idx + 5) % 7;

        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("12:00".into()),
            active_days: vec![day1, day2],
            ..Default::default()
        };

        let trigger_ts = calculate_next_trigger(&input).unwrap().unwrap();
        let trigger_dt = DateTime::from_timestamp_millis(trigger_ts).unwrap().with_timezone(&Local);

        assert!(trigger_dt > now);

        // Should pick the nearest one (day1, which is +2 days)
        let diff = trigger_dt.signed_duration_since(now);
        // It might be +1 day and some hours, or +2 days.
        // Basically checking it's closer to +2 days than +5 days.
        assert!(diff.num_days() <= 3);

        // Double check the weekday matches day1
        assert_eq!(trigger_dt.weekday().num_days_from_sunday() as i32, day1);
    }

    #[test]
    fn test_calculate_after_skips_current_occurrence() {
        let now = Local::now();
        let today_idx = now.weekday().num_days_from_sunday() as i32;
        let tomorrow_idx = (today_idx + 1) % 7;
        let target_time = (now + chrono::Duration::minutes(5))
            .format("%H:%M")
            .to_string();

        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some(target_time),
            active_days: vec![today_idx, tomorrow_idx],
            ..Default::default()
        };

        let first_trigger = calculate_next_trigger(&input).unwrap().unwrap();
        let skipped_trigger = calculate_next_trigger_after(&input, first_trigger + 1_000)
            .unwrap()
            .unwrap();

        assert!(skipped_trigger > first_trigger);

        let first_day = DateTime::from_timestamp_millis(first_trigger)
            .unwrap()
            .with_timezone(&Local)
            .weekday()
            .num_days_from_sunday() as i32;
        let skipped_day = DateTime::from_timestamp_millis(skipped_trigger)
            .unwrap()
            .with_timezone(&Local)
            .weekday()
            .num_days_from_sunday() as i32;

        assert_eq!(first_day, today_idx);
        assert_eq!(skipped_day, tomorrow_idx);
    }

    #[test]
    fn test_window_zero_length_errors() {
        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Window,
            window_start: Some("07:00".into()),
            window_end: Some("07:00".into()),
            active_days: vec![0, 1, 2, 3, 4, 5, 6],
            ..Default::default()
        };

        assert!(calculate_next_trigger(&input).is_err());
    }

    #[test]
    fn test_overnight_window_crossing_midnight_does_not_error() {
        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Window,
            window_start: Some("23:30".into()),
            window_end: Some("00:15".into()),
            active_days: vec![0, 1, 2, 3, 4, 5, 6],
            ..Default::default()
        };

        let trigger = calculate_next_trigger(&input).unwrap();
        assert!(trigger.is_some());
    }

    #[test]
    fn test_window_samples_remaining_time_when_already_open() {
        let now = Local::now();
        let today_idx = now.weekday().num_days_from_sunday() as i32;
        let start = (now - chrono::Duration::minutes(10)).format("%H:%M").to_string();
        let end = (now + chrono::Duration::minutes(20)).format("%H:%M").to_string();

        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Window,
            window_start: Some(start),
            window_end: Some(end),
            active_days: vec![today_idx],
            ..Default::default()
        };

        let trigger_ts = calculate_next_trigger(&input).unwrap().unwrap();
        let trigger_dt = DateTime::from_timestamp_millis(trigger_ts).unwrap().with_timezone(&Local);

        // Should sample from the remaining time of today's window, not skip to next week.
        assert!(trigger_dt > now);
        assert!(trigger_dt.signed_duration_since(now) < chrono::Duration::minutes(21));
        assert_eq!(trigger_dt.weekday().num_days_from_sunday() as i32, today_idx);
    }

    #[test]
    fn test_overnight_window_samples_remaining_time_from_last_night() {
        // Use a synthetic "now" of 00:10 so this isn't flaky depending on
        // when the test suite actually runs.
        let synthetic_now = Local::now()
            .date_naive()
            .and_hms_opt(0, 10, 0)
            .unwrap()
            .and_local_timezone(Local)
            .earliest()
            .unwrap();
        let today_idx = synthetic_now.weekday().num_days_from_sunday() as i32;
        let yesterday_idx = (today_idx + 6) % 7;

        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Window,
            window_start: Some("23:00".into()),
            window_end: Some("01:00".into()),
            // Only yesterday is active, so the forward-looking loop alone
            // (which starts at "today") would miss this entirely.
            active_days: vec![yesterday_idx],
            ..Default::default()
        };

        let trigger_ts = calculate_next_trigger_from(&input, synthetic_now, ReferenceKind::Fresh)
            .unwrap()
            .unwrap();
        let trigger_dt = DateTime::from_timestamp_millis(trigger_ts).unwrap().with_timezone(&Local);

        // Should sample from the remaining ~50 minutes of last night's window.
        assert!(trigger_dt > synthetic_now);
        assert!(trigger_dt.signed_duration_since(synthetic_now) < chrono::Duration::minutes(51));
    }

    #[test]
    fn test_after_occurrence_does_not_resample_open_window() {
        let now = Local::now();
        let today_idx = now.weekday().num_days_from_sunday() as i32;
        let start = (now - chrono::Duration::minutes(10)).format("%H:%M").to_string();
        let end = (now + chrono::Duration::minutes(20)).format("%H:%M").to_string();

        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Window,
            window_start: Some(start),
            window_end: Some(end),
            // Only today is active, so the only way to get another trigger
            // is to skip forward a full week.
            active_days: vec![today_idx],
            ..Default::default()
        };

        // Simulate dismissing a trigger that fired a moment ago, inside this same window.
        let fired_at = now.timestamp_millis();
        let after = calculate_next_trigger_after(&input, fired_at + 1_000).unwrap();

        if let Some(ts) = after {
            let dt = DateTime::from_timestamp_millis(ts).unwrap().with_timezone(&Local);
            // Must not resample later today's remaining window time.
            assert!(dt.signed_duration_since(now) > chrono::Duration::days(6));
        }
    }
}
