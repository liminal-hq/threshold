use std::sync::Arc;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Listener, Runtime,
};

mod batch_collector;
mod error;
mod models;
mod publisher;

pub use error::{Error, Result};

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
                            handle_sync_needed(sync_publisher, sync_listener, payload).await;
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

async fn handle_sync_needed(
    publisher: Arc<dyn WearSyncPublisher>,
    collector: Arc<BatchCollector>,
    payload: AlarmsSyncNeeded,
) {
    if let Some((ids, revision)) = collector.flush().await {
        log::info!(
            "wear-sync: flushing {} pending alarms at revision {} before immediate sync",
            ids.len(),
            revision
        );
        publisher.publish_batch(ids, revision);
    }

    publisher.publish_immediate(&payload.reason, payload.revision);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publisher::WearSyncPublisher;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Debug)]
    enum PublishCall {
        Batch(Vec<i32>, i64),
        Immediate(SyncReason, i64),
    }

    #[derive(Default)]
    struct TestPublisher {
        calls: Arc<Mutex<Vec<PublishCall>>>,
    }

    impl WearSyncPublisher for TestPublisher {
        fn publish_batch(&self, ids: Vec<i32>, revision: i64) {
            self.calls.lock().unwrap().push(PublishCall::Batch(ids, revision));
        }

        fn publish_immediate(&self, reason: &SyncReason, revision: i64) {
            self.calls
                .lock()
                .unwrap()
                .push(PublishCall::Immediate(reason.clone(), revision));
        }
    }

    #[tokio::test]
    async fn sync_needed_flushes_before_immediate() {
        let publisher = Arc::new(TestPublisher::default());
        let collector = Arc::new(BatchCollector::new(500, publisher.clone()));

        collector.add(vec![9, 10], 40).await;

        let payload = AlarmsSyncNeeded {
            reason: SyncReason::ForceSync,
            revision: 41,
        };

        handle_sync_needed(publisher.clone(), collector, payload).await;

        let calls = publisher.calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
        match (&calls[0], &calls[1]) {
            (PublishCall::Batch(ids, revision), PublishCall::Immediate(reason, immediate_rev)) => {
                let mut ids = ids.clone();
                ids.sort_unstable();
                assert_eq!(ids, vec![9, 10]);
                assert_eq!(*revision, 40);
                assert_eq!(*reason, SyncReason::ForceSync);
                assert_eq!(*immediate_rev, 41);
            }
            _ => panic!("unexpected publish order"),
        }
    }
}
