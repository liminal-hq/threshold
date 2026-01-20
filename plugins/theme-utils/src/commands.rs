use tauri::{AppHandle, command, Runtime};

use crate::models::GetMaterialYouColoursResponse;
use crate::Result;
use crate::ThemeUtilsExt;

#[command]
pub(crate) fn get_material_you_colours<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetMaterialYouColoursResponse> {
    app.theme_utils().get_material_you_colours()
}
