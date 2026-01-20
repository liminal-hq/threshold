use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::GetMaterialYouColoursResponse;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.plugin.themeutils";

#[cfg(target_os = "ios")]
extern "C" {
    fn init_plugin_theme_utils(webview: std::ffi::c_void);
}

#[cfg(target_os = "ios")]
const PLUGIN_IDENTIFIER: &str = "tauri.plugin.themeutils";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<ThemeUtils<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ThemeUtilsPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_theme_utils)?;
    Ok(ThemeUtils(handle))
}

/// Access to the theme-utils APIs.
pub struct ThemeUtils<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> ThemeUtils<R> {
    pub fn get_material_you_colours(&self) -> crate::Result<GetMaterialYouColoursResponse> {
        self.0
            .run_mobile_plugin("getMaterialYouColours", ())
            .map_err(Into::into)
    }
}
