use tauri::{AppHandle, command, Runtime};

use crate::models::MaterialYouResponse;
use crate::ThemeUtilsExt;

#[command]
pub(crate) async fn get_material_you_colours<R: Runtime>(
    app: AppHandle<R>,
) -> Result<MaterialYouResponse, String> {
    app.theme_utils().get_material_you_colours().map_err(|e| e.to_string())
}
