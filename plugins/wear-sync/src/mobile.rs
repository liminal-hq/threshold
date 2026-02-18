// Android platform bridge — calls Kotlin WearSyncPlugin via Tauri's auto-generated bridge
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::Serialize;

use crate::models::{PublishRequest, SyncRequest, WatchMessage};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    plugin::PluginApi,
    AppHandle, Emitter, Runtime,
};
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

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
    {
        let handle = api.register_android_plugin(
            "ca.liminalhq.threshold.wearsync",
            "WearSyncPlugin",
        )?;

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

        return Ok(WearSync { handle });
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let _ = api;
        log::info!("wear-sync: mobile plugin initialised as no-op on non-Android target");
        Ok(WearSync {})
    }
}

/// Phone-side Wear Data Layer bridge.
///
/// Wraps the Tauri `PluginHandle` to provide typed methods that call
/// through to the Kotlin `WearSyncPlugin` via `run_mobile_plugin()`.
pub struct WearSync<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
}

impl<R: Runtime> WearSync<R> {
    /// Publish alarm data to the connected watch via the Wear Data Layer.
    ///
    /// The Kotlin side creates a `PutDataMapRequest` at `/threshold/alarms`
    /// and writes the serialised alarm JSON plus the current revision.
    pub fn publish_to_watch(&self, request: PublishRequest) -> crate::Result<()> {
        #[cfg(not(target_os = "android"))]
        {
            let _ = request;
            log::debug!("wear-sync: publish_to_watch no-op on non-Android mobile target");
            return Ok(());
        }

        #[cfg(target_os = "android")]
        self.handle
            .run_mobile_plugin("publishToWatch", request)
            .map_err(Into::into)
    }

    /// Request connected watches to initiate a sync by sending a message
    /// via `MessageClient` to all connected nodes.
    pub fn request_sync_from_watch(&self, request: SyncRequest) -> crate::Result<()> {
        #[cfg(not(target_os = "android"))]
        {
            let _ = request;
            log::debug!("wear-sync: request_sync_from_watch no-op on non-Android mobile target");
            return Ok(());
        }

        #[cfg(target_os = "android")]
        self.handle
            .run_mobile_plugin("requestSyncFromWatch", request)
            .map_err(Into::into)
    }

    /// Mark the watch message pipeline as ready on Kotlin side.
    ///
    /// Called after the app has registered its watch event listeners so the
    /// Kotlin side can drain queued messages without racing app setup.
    pub fn mark_watch_pipeline_ready(&self) -> crate::Result<()> {
        #[cfg(not(target_os = "android"))]
        {
            log::debug!(
                "wear-sync: mark_watch_pipeline_ready no-op on non-Android mobile target"
            );
            return Ok(());
        }

        #[cfg(target_os = "android")]
        self.handle
            .run_mobile_plugin("markWatchPipelineReady", ())
            .map_err(Into::into)
    }
}
