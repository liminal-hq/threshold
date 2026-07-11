// Android bridge: registers a Channel for native OnBackAnimationCallback frames (re-emitted
// as a Tauri event) and forwards setCanGoBack toggles down to the Kotlin plugin
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{de::DeserializeOwned, Serialize};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
    AppHandle, Emitter, Runtime,
};

use crate::models::{PredictiveBackEvent, SetCanGoBackRequest};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.plugin.predictiveback";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PredictiveBackEventHandler {
    handler: Channel,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<PredictiveBack<R>> {
    #[cfg(target_os = "android")]
    let handle = {
        let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "PredictiveBackPlugin")?;
        let app_handle = app.clone();

        handle.run_mobile_plugin::<()>(
            "setPredictiveBackHandler",
            PredictiveBackEventHandler {
                handler: Channel::new(move |event| {
                    let payload = match event {
                        InvokeResponseBody::Json(payload) => {
                            serde_json::from_str::<PredictiveBackEvent>(&payload).ok()
                        }
                        _ => None,
                    };

                    if let Some(payload) = payload {
                        let _ = app_handle.emit("predictive-back:event", &payload);
                    } else {
                        log::warn!("predictive-back: failed to parse gesture event payload");
                    }
                    Ok(())
                }),
            },
        )?;

        handle
    };

    // NOTE: iOS is out of scope -- Threshold's predictive back feature is Android-only,
    // matching the rest of the app's iOS-deferred plugins (e.g. os-prefs).
    #[cfg(target_os = "ios")]
    let _ = api;

    Ok(PredictiveBack {
        #[cfg(target_os = "android")]
        handle,
        #[cfg(target_os = "ios")]
        _marker: std::marker::PhantomData,
    })
}

/// Access to the PredictiveBack APIs.
pub struct PredictiveBack<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(target_os = "ios")]
    _marker: std::marker::PhantomData<R>,
}

impl<R: Runtime> PredictiveBack<R> {
    pub fn set_can_go_back(&self, can_go_back: bool) -> crate::Result<()> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin("setCanGoBack", SetCanGoBackRequest { can_go_back })
                .map_err(Into::into)
        }

        #[cfg(target_os = "ios")]
        {
            // Stub: predictive back isn't implemented on iOS.
            let _ = can_go_back;
            Ok(())
        }
    }
}
