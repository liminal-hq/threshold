use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_app_management);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<AppManagement<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.plugin.app_management", "AppManagementPlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_app_management)?;
  Ok(AppManagement(handle))
}

/// Access to the app-management APIs.
pub struct AppManagement<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AppManagement<R> {
  pub fn minimize_app(&self) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin("minimize_app", ())
      .map_err(Into::into)
  }
}
