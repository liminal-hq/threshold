// Android platform bridge — calls Kotlin WearSyncPlugin via Tauri's auto-generated bridge
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::Serialize;

use crate::models::{PublishRequest, SyncRequest, WatchMessage};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
    AppHandle, Emitter, Runtime,
};

/// Payload sent to the Kotlin side to register the watch message channel.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchMessageHandler {
    handler: Channel,
}

/// Initialise the mobile backend for the wear-sync plugin.
///
/// Registers the Kotlin `WearSyncPlugin` via the Tauri auto-generated bridge
/// and sets up a [Channel] so Kotlin can send watch messages directly to Rust
/// without going through the WebView/JS layer.
pub fn init<R: Runtime>(
    app: &AppHandle<R>,
    api: PluginApi<R, ()>,
) -> crate::Result<WearSync<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(
        "ca.liminalhq.threshold.wearsync",
        "WearSyncPlugin",
    )?;

    // iOS is not supported for Wear OS, but the mobile cfg includes it.
    // Provide a fallback that will never be reached on Android.
    #[cfg(not(target_os = "android"))]
    let handle = {
        let _ = api;
        unreachable!("wear-sync mobile plugin is only supported on Android")
    };

    // Register a Channel with the Kotlin side so it can send watch messages
    // directly to Rust via JNI, bypassing the WebView/JS layer entirely.
    let app_handle = app.clone();
    handle.run_mobile_plugin::<()>(
        "setWatchMessageHandler",
        WatchMessageHandler {
            handler: Channel::new(move |event| {
                let msg = match event {
                    InvokeResponseBody::Json(payload) => {
                        serde_json::from_str::<WatchMessage>(&payload).ok()
                    }
                    _ => None,
                };

                if let Some(msg) = msg {
                    log::debug!(
                        "wear-sync: received watch message via channel: path={}",
                        msg.path
                    );
                    let _ = app_handle.emit("wear:message:received", &msg);
                } else {
                    log::warn!("wear-sync: failed to parse watch message from channel");
                }

                Ok(())
            }),
        },
    )?;

    Ok(WearSync { handle })
}

/// Phone-side Wear Data Layer bridge.
///
/// Wraps the Tauri `PluginHandle` to provide typed methods that call
/// through to the Kotlin `WearSyncPlugin` via `run_mobile_plugin()`.
pub struct WearSync<R: Runtime> {
    handle: PluginHandle<R>,
}

impl<R: Runtime> WearSync<R> {
    /// Publish alarm data to the connected watch via the Wear Data Layer.
    ///
    /// The Kotlin side creates a `PutDataMapRequest` at `/threshold/alarms`
    /// and writes the serialised alarm JSON plus the current revision.
    pub fn publish_to_watch(&self, request: PublishRequest) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin("publishToWatch", request)
            .map_err(Into::into)
    }

    /// Request connected watches to initiate a sync by sending a message
    /// via `MessageClient` to all connected nodes.
    pub fn request_sync_from_watch(&self, request: SyncRequest) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin("requestSyncFromWatch", request)
            .map_err(Into::into)
    }
}
