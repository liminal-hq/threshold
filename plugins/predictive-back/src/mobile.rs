use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};
use crate::models::*;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.plugin.predictiveback";

#[cfg(target_os = "android")]
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<PredictiveBack> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "PredictiveBackPlugin")?;
    Ok(PredictiveBack(handle))
}

/// Access to the predictive-back APIs.
pub struct PredictiveBack(PluginHandle<crate::models::SetCanGoBackRequest>);

impl PredictiveBack {
    pub fn set_can_go_back(&self, can_go_back: bool) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("setCanGoBack", SetCanGoBackRequest { can_go_back })
            .map_err(Into::into)
    }
}
