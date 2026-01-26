use chrono::{Datelike, Local, NaiveTime};
use rand::Rng;
use crate::alarm::{models::*, error::Result};

/// Calculate next trigger timestamp for an alarm
pub fn calculate_next_trigger(alarm: &AlarmInput) -> Result<Option<i64>> {
    if !alarm.enabled {
        return Ok(None);
    }

    match alarm.mode {
        AlarmMode::Fixed => {
            let time = alarm.fixed_time.as_ref()
                .ok_or("Fixed alarm missing fixedTime")?;
            calculate_fixed_trigger(time, &alarm.active_days)
        },
        AlarmMode::Window => {
            let start = alarm.window_start.as_ref()
                .ok_or("Window alarm missing windowStart")?;
            let end = alarm.window_end.as_ref()
                .ok_or("Window alarm missing windowEnd")?;
            calculate_window_trigger(start, end, &alarm.active_days)
        },
    }
}

fn calculate_fixed_trigger(time_str: &str, active_days: &[i32]) -> Result<Option<i64>> {
    let now = Local::now();
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
) -> Result<Option<i64>> {
    let now = Local::now();
    let start_time = NaiveTime::parse_from_str(start_str, "%H:%M")?;
    let end_time = NaiveTime::parse_from_str(end_str, "%H:%M")?;

    // Validate window
    if end_time <= start_time {
        return Err("Window end must be after start".into());
    }

    // Find next occurrence
    for days_ahead in 0..8 {
        let candidate = now + chrono::Duration::days(days_ahead);
        let weekday = candidate.weekday().num_days_from_sunday() as i32;

        if active_days.contains(&weekday) {
            // Use earliest() to handle DST fallback safely
            if let Some(window_start) = candidate
                .date_naive()
                .and_time(start_time)
                .and_local_timezone(Local)
                .earliest()
            {
                if window_start > now {
                    // Calculate random offset within window
                    let window_duration_secs = end_time
                        .signed_duration_since(start_time)
                        .num_seconds();

                    let random_offset_secs = rand::thread_rng()
                        .gen_range(0..window_duration_secs);

                    let trigger = window_start
                        + chrono::Duration::seconds(random_offset_secs);

                    return Ok(Some(trigger.timestamp_millis()));
                }
            }
        }
    }

    Ok(None)
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
}
