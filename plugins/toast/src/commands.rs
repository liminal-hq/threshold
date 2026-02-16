use tauri::{command, AppHandle, Runtime};

use crate::models::ShowToastRequest;
use crate::Result;
use crate::ToastExt;

#[command]
pub(crate) async fn show<R: Runtime>(app: AppHandle<R>, payload: ShowToastRequest) -> Result<()> {
    app.toast().show(payload)
}
