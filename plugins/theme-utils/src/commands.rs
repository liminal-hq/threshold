// Tauri command handlers exposed to the webview
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use tauri::{command, AppHandle, Runtime};

use crate::models::MaterialYouResponse;
use crate::ThemeUtilsExt;

#[command]
pub(crate) async fn get_material_you_colours<R: Runtime>(
    app: AppHandle<R>,
) -> Result<MaterialYouResponse, String> {
    app.theme_utils()
        .get_material_you_colours()
        .map_err(|e| e.to_string())
}
