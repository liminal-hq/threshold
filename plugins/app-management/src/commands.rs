use tauri::{command, AppHandle, Runtime};

use crate::AppManagementExt;
use crate::Result;

#[command]
pub(crate) async fn minimize_app<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.app_management().minimize_app()
}
