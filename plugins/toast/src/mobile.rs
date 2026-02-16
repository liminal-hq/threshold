use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::ShowToastRequest;

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<Toast<R>> {
    #[cfg(not(target_os = "android"))]
    let _ = &api;

    #[cfg(target_os = "android")]
    {
        let handle = api.register_android_plugin("com.plugin.toast", "ToastPlugin")?;
        return Ok(Toast(handle));
    }

    #[cfg(not(target_os = "android"))]
    {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "tauri-plugin-toast currently supports Android only",
        )
        .into())
    }
}

/// Access to the toast APIs.
pub struct Toast<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Toast<R> {
    pub fn show(&self, payload: ShowToastRequest) -> crate::Result<()> {
        self.0.run_mobile_plugin("show", payload).map_err(Into::into)
    }
}
