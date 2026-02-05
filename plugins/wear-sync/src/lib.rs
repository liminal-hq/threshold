use std::sync::Arc;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Listener, Runtime,
};

mod batch_collector;
mod models;
mod publisher;

use batch_collector::BatchCollector;
use models::{AlarmsBatchUpdated, AlarmsSyncNeeded, SyncReason};
use publisher::WearSyncPublisher;

const BATCH_DEBOUNCE_MS: u64 = 500;

/// Initialises the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("wear-sync")
        .setup(|app, _api| {
            let publisher: Arc<dyn WearSyncPublisher> = Arc::new(LogPublisher);
            let batch_collector = Arc::new(BatchCollector::new(BATCH_DEBOUNCE_MS, Arc::clone(&publisher)));

            let batch_listener = Arc::clone(&batch_collector);
            app.listen("alarms:batch:updated", move |event| {
                match serde_json::from_str::<AlarmsBatchUpdated>(event.payload()) {
                    Ok(payload) => {
                        let batch_listener = Arc::clone(&batch_listener);
                        tauri::async_runtime::spawn(async move {
                            batch_listener
                                .add(payload.updated_ids, payload.revision)
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
            let sync_publisher = Arc::clone(&publisher);
            app.listen("alarms:sync:needed", move |event| {
                match serde_json::from_str::<AlarmsSyncNeeded>(event.payload()) {
                    Ok(payload) => {
                        let sync_listener = Arc::clone(&sync_listener);
                        let sync_publisher = Arc::clone(&sync_publisher);
                        tauri::async_runtime::spawn(async move {
                            if let Some((ids, revision)) = sync_listener.flush().await {
                                log::info!(
                                    "wear-sync: flushing {} pending alarms at revision {} before immediate sync",
                                    ids.len(),
                                    revision
                                );
                                sync_publisher.publish_batch(ids, revision);
                            }

                            sync_publisher.publish_immediate(&payload.reason, payload.revision);
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

struct LogPublisher;

impl WearSyncPublisher for LogPublisher {
    fn publish_batch(&self, ids: Vec<i32>, revision: i64) {
        log::info!(
            "wear-sync: batch ready for publish ({} alarms, revision {})",
            ids.len(),
            revision
        );
        // TODO: Publish to Wear Data Layer.
    }

    fn publish_immediate(&self, reason: &SyncReason, revision: i64) {
        log::info!(
            "wear-sync: immediate sync requested ({:?}) at revision {}",
            reason,
            revision
        );
        // TODO: Publish to Wear Data Layer.
    }
}
