// Android bridge for backgrounding the app
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<AppManagement<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.plugin.app_management", "AppManagementPlugin")?;

    // NOTE: iOS implementation is deferred. We intentionally do not register an iOS plugin here
    // -- there is no `PluginApi::handle()` to fall back to either (only `config()`/`app()`/
    // `scope()` exist), so there is nothing to store; `minimize_app` returns a stub error
    // instead of ever touching a handle that was never obtained.
    #[cfg(not(target_os = "android"))]
    let _ = api;

    Ok(AppManagement {
        #[cfg(target_os = "android")]
        handle,
        #[cfg(not(target_os = "android"))]
        _marker: std::marker::PhantomData,
    })
}

/// Access to the app-management APIs.
pub struct AppManagement<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<R>,
}

impl<R: Runtime> AppManagement<R> {
    pub fn minimize_app(&self) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        return self
            .handle
            .run_mobile_plugin("minimizeApp", ())
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
