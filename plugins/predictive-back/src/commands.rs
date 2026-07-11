// Tauri command handlers exposed to the webview
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use tauri::{command, AppHandle, Runtime};

use crate::error::Result;
use crate::models::SetCanGoBackRequest;
use crate::PredictiveBackExt;

#[command]
pub(crate) async fn set_can_go_back<R: Runtime>(
    app: AppHandle<R>,
    payload: SetCanGoBackRequest,
) -> Result<()> {
    app.predictive_back().set_can_go_back(payload.can_go_back)
}
