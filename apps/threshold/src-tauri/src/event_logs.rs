use std::{fs, path::PathBuf, time::SystemTime};

use tauri::{AppHandle, Manager};

const MAX_EVENT_LOG_BYTES: usize = 512_000;

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

fn collect_event_logs(app: &AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|err| format!("Failed to locate log directory: {err}"))?;
    let app_name = app.package_info().name.clone();
    let app_version = app.package_info().version.to_string();

    let mut entries: Vec<(PathBuf, SystemTime)> = Vec::new();
    let read_dir = fs::read_dir(&log_dir)
        .map_err(|err| format!("Failed to read log directory: {err}"))?;

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

    entries.sort_by(|a, b| b.1.cmp(&a.1));

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

#[tauri::command]
pub fn export_event_logs(app: AppHandle, destination: String) -> Result<String, String> {
    let content = collect_event_logs(&app)?;
    if destination.starts_with("content://") {
        return Err(
            "Android content URIs are not supported for log export. Please choose a file path."
                .to_string(),
        );
    }

    let normalised_destination = destination
        .strip_prefix("file://")
        .unwrap_or(destination.as_str());
    let destination_path = PathBuf::from(normalised_destination);
    if let Some(parent) = destination_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("Failed to create log export directory: {err}"))?;
        }
    }

    fs::write(&destination_path, content)
        .map_err(|err| {
            format!(
                "Failed to write event logs to {normalised_destination}: {err}"
            )
        })?;
    Ok(normalised_destination.to_string())
}

#[tauri::command]
pub fn get_event_logs(app: AppHandle) -> Result<String, String> {
    collect_event_logs(&app)
}

#[cfg(test)]
mod tests {
    use super::truncate_to_limit;

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
}
