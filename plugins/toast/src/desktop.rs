use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::ShowToastRequest;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Toast<R>> {
    Ok(Toast(app.clone()))
}

/// Access to the toast APIs.
pub struct Toast<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Toast<R> {
    pub fn show(&self, _payload: ShowToastRequest) -> crate::Result<()> {
        // Desktop is intentionally a no-op for now.
        Ok(())
    }
}
