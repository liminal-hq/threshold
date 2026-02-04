use tauri::{AppHandle, command, Runtime};

use crate::Result;
use crate::AppManagementExt;

#[command]
pub(crate) async fn minimize_app<R: Runtime>(
    app: AppHandle<R>,
) -> Result<()> {
    app.app_management().minimize_app()
}
