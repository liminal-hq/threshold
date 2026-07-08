// Tauri command handlers exposed to the webview
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use tauri::{command, AppHandle, Runtime};

use crate::AppManagementExt;
use crate::Result;

#[command]
pub(crate) async fn minimize_app<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.app_management().minimize_app()
}
