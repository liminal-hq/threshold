use std::sync::Arc;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Listener, Runtime,
};

mod batch_collector;
mod models;

use batch_collector::{BatchCollector, BatchPublish};
use models::{AlarmsBatchUpdated, AlarmsSyncNeeded};

const BATCH_DEBOUNCE_MS: u64 = 500;

/// Initialises the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("wear-sync")
        .setup(|app, _api| {
            let publish: BatchPublish = Arc::new(|ids, revision| {
                log::info!(
                    "wear-sync: batch ready for publish ({} alarms, revision {})",
                    ids.len(),
                    revision
                );
                // TODO: Publish to Wear Data Layer.
            });

            let batch_collector = Arc::new(BatchCollector::new(BATCH_DEBOUNCE_MS, publish));

            let batch_listener = Arc::clone(&batch_collector);
            app.listen("alarms:batch:updated", move |event| {
                match serde_json::from_str::<AlarmsBatchUpdated>(event.payload()) {
                    Ok(payload) => {
                        let batch_listener = Arc::clone(&batch_listener);
                        tauri::async_runtime::spawn(async move {
                            batch_listener
                                .push(payload.updated_ids, payload.revision)
                                .await;
                        });
                    }
                    Err(error) => {
                        log::warn!(
                            "wear-sync: failed to parse alarms:batch:updated payload: {error}"
                        );
                    }
                }
            });

            let sync_listener = Arc::clone(&batch_collector);
            app.listen("alarms:sync:needed", move |event| {
                match serde_json::from_str::<AlarmsSyncNeeded>(event.payload()) {
                    Ok(payload) => {
                        let sync_listener = Arc::clone(&sync_listener);
                        tauri::async_runtime::spawn(async move {
                            if let Some((ids, revision)) = sync_listener.flush().await {
                                log::info!(
                                    "wear-sync: flushing {} pending alarms at revision {} before immediate sync",
                                    ids.len(),
                                    revision
                                );
                            }

                            publish_immediate_sync(&payload);
                        });
                    }
                    Err(error) => {
                        log::warn!(
                            "wear-sync: failed to parse alarms:sync:needed payload: {error}"
                        );
                    }
                }
            });

            Ok(())
        })
        .build()
}

fn publish_immediate_sync(payload: &AlarmsSyncNeeded) {
    log::info!(
        "wear-sync: immediate sync requested ({:?}) at revision {}",
        payload.reason,
        payload.revision
    );
    // TODO: Publish to Wear Data Layer.
}
