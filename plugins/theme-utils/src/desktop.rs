use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::{MaterialYouResponse, Palettes};

pub fn init<R: Runtime>(
    api: PluginApi<R, ()>,
    _app: &AppHandle<R>,
) -> crate::Result<ThemeUtils<R>> {
    Ok(ThemeUtils(api))
}

/// Access to the theme-utils APIs.
pub struct ThemeUtils<R: Runtime>(PluginApi<R, ()>);

impl<R: Runtime> ThemeUtils<R> {
    pub fn get_material_you_colours(&self) -> crate::Result<MaterialYouResponse> {
        // Desktop does not support Material You
        println!("[ThemeUtils] Desktop platform detected, returning empty Material You response.");
        Ok(MaterialYouResponse {
            supported: false,
            api_level: 0,
            palettes: Palettes {
                system_accent1: None,
                system_accent2: None,
                system_accent3: None,
                system_neutral1: None,
                system_neutral2: None,
            },
        })
    }
}
