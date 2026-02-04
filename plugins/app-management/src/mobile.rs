use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<AppManagement<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.plugin.app_management", "AppManagementPlugin")?;

  // NOTE: iOS implementation is deferred. We intentionally do not register an iOS plugin here.
  // On iOS we don't register anything because we are providing a Rust-side stub only.
  #[cfg(not(target_os = "android"))]
  let handle = api.handle().clone();

  Ok(AppManagement(handle))
}

/// Access to the app-management APIs.
pub struct AppManagement<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AppManagement<R> {
  pub fn minimize_app(&self) -> crate::Result<()> {
    #[cfg(target_os = "android")]
    return self
      .0
      .run_mobile_plugin("minimize_app", ())
      .map_err(Into::into);

    #[cfg(not(target_os = "android"))]
    return Err(crate::Error::PluginInvoke(
      tauri::plugin::mobile::PluginInvokeError::from(std::io::Error::new(
        std::io::ErrorKind::Other,
        "Not implemented on iOS",
      )),
    ));
  }
}
