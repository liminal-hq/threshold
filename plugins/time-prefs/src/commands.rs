use tauri::{command, AppHandle, Runtime};

use crate::models::TimeFormatResponse;
use crate::TimePrefsExt;
use crate::error::Result;

#[command]
pub(crate) async fn get_time_format<R: Runtime>(
    app: AppHandle<R>,
) -> Result<TimeFormatResponse> {
    app.time_prefs().get_time_format()
}
