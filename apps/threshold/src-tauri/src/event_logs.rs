// Reads, sorts, and truncates on-disk event log files for diagnostic export
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::{fs, path::PathBuf, time::SystemTime};

use tauri::{AppHandle, Manager};
use tauri_plugin_wear_sync::WearSyncExt;

// Bounded wait for the watch's log response to land on disk before the export reads
// the log directory -- the Data Layer round trip has no synchronous completion signal,
// so this just gives it a fixed window rather than blocking indefinitely on an
// unreachable/asleep watch. If it's too slow or unreachable, the export still proceeds
// with whatever's already on disk. Android-only: no watch pairing is possible from
// desktop at all, so there's nothing to wait for there.
#[cfg(target_os = "android")]
const WATCH_LOG_WAIT: std::time::Duration = std::time::Duration::from_secs(3);

// Caps the assembled export at a reasonable size for a diagnostic dump sent to the
// developer -- previously `usize::MAX`, which made the truncation logic below a no-op.
const MAX_EVENT_LOG_BYTES: usize = 2 * 1024 * 1024;

fn truncate_to_limit(value: &str, limit: usize) -> (String, bool) {
    if value.len() <= limit {
        return (value.to_string(), false);
    }

    if limit == 0 {
        return (String::new(), true);
    }

    let mut end = 0;
    for (index, ch) in value.char_indices() {
        let next = index + ch.len_utf8();
        if next > limit {
            break;
        }
        end = next;
    }

    (value[..end].to_string(), true)
}

/// Reads and formats the on-disk event logs into a single diagnostic string. Pure aside
/// from the filesystem reads, so it's directly testable without an `AppHandle` and can be
/// run on a blocking thread pool from the async commands below without touching `tauri`
/// types at all.
fn read_and_format_logs(
    log_dir: PathBuf,
    app_name: String,
    app_version: String,
) -> Result<String, String> {
    let mut entries: Vec<(PathBuf, SystemTime)> = Vec::new();
    let read_dir =
        fs::read_dir(&log_dir).map_err(|err| format!("Failed to read log directory: {err}"))?;

    for entry in read_dir {
        let entry = entry.map_err(|err| format!("Failed to read log entry: {err}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = match path.file_name().and_then(|name| name.to_str()) {
            Some(name) => name,
            None => continue,
        };
        if !file_name.starts_with(&app_name) || !file_name.ends_with(".log") {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        entries.push((path, modified));
    }

    entries.sort_by_key(|b| std::cmp::Reverse(b.1));

    let mut output = String::new();
    output.push_str(&format!("{app_name} event logs\n"));
    output.push_str(&format!("Version: {app_version}\n"));
    output.push_str(&format!("Log directory: {}\n\n", log_dir.display()));

    if entries.is_empty() {
        output.push_str("No log files were found.\n");
        return Ok(output);
    }

    let mut remaining = MAX_EVENT_LOG_BYTES.saturating_sub(output.len());
    for (path, _) in entries {
        if remaining == 0 {
            break;
        }

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown.log");
        let header = format!("==== {file_name} ====\n");
        let (header_chunk, _) = truncate_to_limit(&header, remaining);
        output.push_str(&header_chunk);
        remaining = remaining.saturating_sub(header_chunk.len());
        if remaining == 0 {
            break;
        }

        match fs::read_to_string(&path) {
            Ok(content) => {
                let (chunk, truncated) = truncate_to_limit(&content, remaining);
                output.push_str(&chunk);
                remaining = remaining.saturating_sub(chunk.len());
                if truncated {
                    output.push_str("\n[Log output truncated]\n");
                    break;
                }
            }
            Err(err) => {
                let message = format!("(Unable to read {file_name}: {err})\n");
                let (chunk, truncated) = truncate_to_limit(&message, remaining);
                output.push_str(&chunk);
                remaining = remaining.saturating_sub(chunk.len());
                if truncated {
                    break;
                }
            }
        }

        let (divider, _) = truncate_to_limit("\n", remaining);
        output.push_str(&divider);
        remaining = remaining.saturating_sub(divider.len());
    }

    Ok(output)
}

// A plain (non-async) #[tauri::command] runs its body directly, inline, on whichever
// thread handles the IPC message -- Tauri does not offload it to a thread pool on its
// own (confirmed via tauri-macros' body_blocking codegen). For a log directory that
// could legitimately be a few MB, that blocking `fs` work needs to be moved to
// spawn_blocking explicitly, which requires the command itself to be async so it can
// await the spawned task without blocking that thread either.
async fn collect_event_logs(app: AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|err| format!("Failed to locate log directory: {err}"))?;
    let app_name = app.package_info().name.clone();
    let app_version = app.package_info().version.to_string();

    tauri::async_runtime::spawn_blocking(move || {
        read_and_format_logs(log_dir, app_name, app_version)
    })
    .await
    .map_err(|err| format!("Failed to spawn blocking task: {err}"))?
}

#[tauri::command]
pub async fn export_event_logs(app: AppHandle, destination: String) -> Result<String, String> {
    let content = collect_event_logs(app).await?;
    if destination.starts_with("content://") {
        return Err(
            "Android content URIs are not supported for log export. Please choose a file path."
                .to_string(),
        );
    }

    let normalised_destination = destination
        .strip_prefix("file://")
        .unwrap_or(destination.as_str())
        .to_string();

    tauri::async_runtime::spawn_blocking(move || {
        let destination_path = PathBuf::from(&normalised_destination);
        if let Some(parent) = destination_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|err| format!("Failed to create log export directory: {err}"))?;
            }
        }

        fs::write(&destination_path, content).map_err(|err| {
            format!("Failed to write event logs to {normalised_destination}: {err}")
        })?;
        Ok(normalised_destination)
    })
    .await
    .map_err(|err| format!("Failed to spawn blocking task: {err}"))?
}

/// Asks the watch to send its own native event log over, then waits a bounded
/// amount of time for the response to land on disk before returning -- so a
/// caller doing `request_watch_logs` then `get_event_logs` gets the watch's
/// content included when it's reachable, without blocking indefinitely when
/// it isn't. See `plugins/wear-sync/android/.../WearMessageService.kt`'s
/// `writeWatchLog` for where the response actually gets written.
///
/// The wait itself only applies on Android -- wear-sync's `request_watch_logs`
/// is an unconditional no-op everywhere else (no watch pairing is possible from
/// desktop at all), so waiting there would just be a fixed delay for nothing.
#[tauri::command]
pub async fn request_watch_logs(app: AppHandle) -> Result<(), String> {
    if let Err(error) = app.wear_sync().request_watch_logs() {
        log::warn!("event_logs: failed to request watch logs: {error}");
    }
    #[cfg(target_os = "android")]
    tokio::time::sleep(WATCH_LOG_WAIT).await;
    Ok(())
}

#[tauri::command]
pub async fn get_event_logs(app: AppHandle) -> Result<String, String> {
    collect_event_logs(app).await
}

#[cfg(test)]
mod tests {
    use super::{read_and_format_logs, truncate_to_limit};

    #[test]
    fn truncate_to_limit_returns_full_string_when_under_limit() {
        let (value, truncated) = truncate_to_limit("threshold", 20);
        assert_eq!(value, "threshold");
        assert!(!truncated);
    }

    #[test]
    fn truncate_to_limit_handles_empty_limit() {
        let (value, truncated) = truncate_to_limit("threshold", 0);
        assert_eq!(value, "");
        assert!(truncated);
    }

    #[test]
    fn truncate_to_limit_respects_utf8_boundaries() {
        let original = "log🚀file";
        let (value, truncated) = truncate_to_limit(original, 5);
        assert_eq!(value, "log");
        assert!(truncated);
    }

    #[test]
    fn read_and_format_logs_includes_matching_files_and_skips_others() {
        let dir = std::env::temp_dir().join(format!(
            "threshold-event-logs-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        std::fs::write(dir.join("threshold.log"), "hello from threshold").unwrap();
        std::fs::write(dir.join("unrelated.log"), "should not appear").unwrap();
        std::fs::write(dir.join("threshold.txt"), "wrong extension, ignored").unwrap();

        let result =
            read_and_format_logs(dir.clone(), "threshold".to_string(), "1.2.3".to_string())
                .unwrap();

        assert!(result.contains("threshold event logs"));
        assert!(result.contains("Version: 1.2.3"));
        assert!(result.contains("==== threshold.log ===="));
        assert!(result.contains("hello from threshold"));
        assert!(!result.contains("should not appear"));
        assert!(!result.contains("wrong extension"));

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
