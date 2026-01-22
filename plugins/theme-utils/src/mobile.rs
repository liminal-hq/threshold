use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::MaterialYouResponse;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.plugin.themeutils";

pub fn init<R: Runtime, C: DeserializeOwned>(
  _api: PluginApi<R, C>,
  _app: &AppHandle<R>,
) -> crate::Result<ThemeUtils<R>> {
  let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "ThemeUtilsPlugin")?;
  Ok(ThemeUtils(handle))
}

/// Access to the theme-utils APIs.
pub struct ThemeUtils<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> ThemeUtils<R> {
  pub fn get_material_you_colours(&self) -> crate::Result<MaterialYouResponse> {
    self
      .0
      .run_mobile_plugin("getMaterialYouColours", ())
      .map_err(Into::into)
  }
}
