use std::sync::Arc;

use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Listener, Manager, Runtime,
};

mod batch_collector;
mod conflict_detector;
#[cfg(desktop)]
mod desktop;
mod error;
#[cfg(mobile)]
mod mobile;
mod models;
mod publisher;
mod sync_protocol;

pub use error::{Error, Result};

// Re-export the platform-specific WearSync type so the app can access it.
#[cfg(desktop)]
pub use desktop::WearSync;
#[cfg(mobile)]
pub use mobile::WearSync;

use batch_collector::BatchCollector;
use models::{AlarmsBatchUpdated, AlarmsSyncNeeded, PublishRequest};
use publisher::{ChannelPublisher, PublishCommand, WearSyncPublisher};

const BATCH_DEBOUNCE_MS: u64 = 500;

/// Extension trait for accessing the wear-sync APIs from any Tauri manager.
pub trait WearSyncExt<R: Runtime> {
    fn wear_sync(&self) -> &WearSync<R>;
}

impl<R: Runtime, T: Manager<R>> WearSyncExt<R> for T {
    fn wear_sync(&self) -> &WearSync<R> {
        self.state::<WearSync<R>>().inner()
    }
}

/// Initialises the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("wear-sync")
        .setup(|app, api| {
            // Initialise platform backend
            #[cfg(mobile)]
            let wear_sync = mobile::init(app, api)?;
            #[cfg(desktop)]
            let wear_sync = desktop::init(app, api)?;
            app.manage(wear_sync);

            // Create the publish channel and spawn the background task
            let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<PublishCommand>();
            spawn_publish_task(app.clone(), rx);

            let publisher: Arc<dyn WearSyncPublisher> = Arc::new(ChannelPublisher::new(tx));
            let batch_collector =
                Arc::new(BatchCollector::new(BATCH_DEBOUNCE_MS, Arc::clone(&publisher)));

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

/// Spawn a background task that receives publish commands from the
/// `ChannelPublisher` and forwards them to the Wear Data Layer via
/// the platform-specific `WearSync` bridge.
///
/// This task has access to the `AppHandle` so it can look up the
/// `WearSync<R>` state to call into Kotlin on Android.
fn spawn_publish_task<R: Runtime>(
    app: AppHandle<R>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<PublishCommand>,
) {
    tauri::async_runtime::spawn(async move {
        while let Some(cmd) = rx.recv().await {
            let wear_sync = app.state::<WearSync<R>>();

            match cmd {
                PublishCommand::Batch { ids, revision } => {
                    log::info!(
                        "wear-sync: publishing batch of {} alarm(s) at revision {}",
                        ids.len(),
                        revision
                    );

                    // Serialise the alarm IDs as JSON for the Kotlin side.
                    // The full alarm data is fetched by the Kotlin plugin from
                    // the Data Layer path, or we send the IDs for a targeted
                    // publish. For now, send the IDs as the payload — the Kotlin
                    // side can request full data via a sync response if needed.
                    let alarms_json = serde_json::to_string(&ids).unwrap_or_default();
                    let request = PublishRequest {
                        alarms_json,
                        revision,
                    };
                    if let Err(error) = wear_sync.publish_to_watch(request) {
                        log::error!("wear-sync: failed to publish batch to watch: {error}");
                    }
                }
                PublishCommand::Immediate { reason, revision } => {
                    log::info!(
                        "wear-sync: immediate publish ({:?}) at revision {}",
                        reason,
                        revision
                    );

                    // For immediate syncs, send the reason and revision.
                    // The Kotlin side will build the full payload.
                    let alarms_json =
                        serde_json::to_string(&reason).unwrap_or_default();
                    let request = PublishRequest {
                        alarms_json,
                        revision,
                    };
                    if let Err(error) = wear_sync.publish_to_watch(request) {
                        log::error!("wear-sync: failed to publish immediate sync to watch: {error}");
                    }
                }
            }
        }
        log::warn!("wear-sync: publish task channel closed, no more commands will be processed");
    });
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
            self.calls
                .lock()
                .unwrap()
                .push(PublishCall::Batch(ids, revision));
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
            (
                PublishCall::Batch(ids, revision),
                PublishCall::Immediate(reason, immediate_rev),
            ) => {
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
