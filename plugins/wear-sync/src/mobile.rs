use crate::models::{PublishRequest, SyncRequest};
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

/// Initialise the mobile backend for the wear-sync plugin.
///
/// Registers the Kotlin `WearSyncPlugin` via the Tauri auto-generated bridge
/// so that Rust can invoke `@Command` methods on the Android side.
pub fn init<R: Runtime>(
    _app: &AppHandle<R>,
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

