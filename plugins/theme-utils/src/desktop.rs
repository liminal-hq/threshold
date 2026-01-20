use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::GetMaterialYouColoursResponse;

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<ThemeUtils<R>> {
    Ok(ThemeUtils(_app.clone()))
}

/// Access to the theme-utils APIs.
pub struct ThemeUtils<R: Runtime>(AppHandle<R>);

impl<R: Runtime> ThemeUtils<R> {
    pub fn get_material_you_colours(&self) -> crate::Result<GetMaterialYouColoursResponse> {
        Ok(GetMaterialYouColoursResponse { colours: None })
    }
}
