use tauri::{command, AppHandle, Runtime};

use crate::error::Result;
use crate::models::TimeFormatResponse;
use crate::TimePrefsExt;

#[command]
pub(crate) async fn get_time_format<R: Runtime>(app: AppHandle<R>) -> Result<TimeFormatResponse> {
    app.time_prefs().get_time_format()
}
