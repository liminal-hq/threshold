// Plugin entry point — event listeners, message routing, and background publish task
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use std::sync::Arc;

use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Listener, Manager, Runtime,
};

mod batch_collector;
#[allow(dead_code)]
mod conflict_detector;
#[cfg(desktop)]
mod desktop;
mod error;
#[cfg(mobile)]
mod mobile;
mod models;
mod publisher;
#[allow(dead_code)]
mod sync_protocol;

pub use error::{Error, Result};

// Re-export the platform-specific WearSync type so the app can access it.
#[cfg(desktop)]
pub use desktop::WearSync;
#[cfg(mobile)]
pub use mobile::WearSync;

use batch_collector::BatchCollector;
use models::{
    AlarmsBatchUpdated, AlarmsSyncNeeded, PublishRequest, WatchDeleteAlarm, WatchMessage,
    WatchSaveAlarm, WatchSyncRequest,
};
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

            // Listen for messages from the watch (routed by Kotlin WearMessageService
            // through WearSyncPlugin → Channel → app.emit("wear:message:received"))
            let watch_app = app.clone();
            app.listen("wear:message:received", move |event| {
                match serde_json::from_str::<WatchMessage>(event.payload()) {
                    Ok(msg) => {
                        handle_watch_message(&watch_app, msg);
                    }
                    Err(error) => {
                        log::warn!(
                            "wear-sync: failed to parse wear:message:received payload: {error}"
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
                        "wear-sync: batch of {} alarm(s) at revision {} — requesting full sync from app",
                        ids.len(),
                        revision
                    );

                    // The batch collector only has alarm IDs, not the full data.
                    // Emit wear:sync:batch_ready so the app crate can fetch all
                    // alarms from the DB and re-emit alarms:sync:needed with the
                    // full payload for a proper FullSync publish.
                    use tauri::Emitter;
                    if let Err(error) = app.emit("wear:sync:batch_ready", &revision) {
                        log::error!("wear-sync: failed to emit batch_ready: {error}");
                    }
                }
                PublishCommand::Immediate { reason, revision, all_alarms_json } => {
                    log::info!(
                        "wear-sync: immediate publish ({:?}) at revision {}",
                        reason,
                        revision
                    );

                    // Build a FullSync response with the real alarm data.
                    let all_alarms: Vec<serde_json::Value> = all_alarms_json
                        .and_then(|json| serde_json::from_str(&json).ok())
                        .unwrap_or_default();

                    let response = sync_protocol::SyncResponse::FullSync {
                        current_revision: revision,
                        all_alarms,
                    };
                    let alarms_json = serde_json::to_string(&response).unwrap_or_default();

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

/// Route an incoming watch message to the appropriate handler.
///
/// The watch sends messages via `MessageClient` to the phone. The Kotlin
/// `WearMessageService` receives them and triggers a `wear:message:received`
/// Tauri event. This function parses the message path and re-emits a more
/// specific event that the app layer can listen for.
///
/// This design keeps the plugin decoupled from the app crate — the plugin
/// emits events, the app layer (which has access to `AlarmCoordinator`)
/// handles them.
fn handle_watch_message<R: Runtime>(app: &AppHandle<R>, msg: WatchMessage) {
    use tauri::Emitter;

    match msg.path.as_str() {
        "/threshold/sync_request" => {
            let watch_revision = msg.data.trim().parse::<i64>().unwrap_or(0);
            log::info!("wear-sync: watch requested sync from revision {watch_revision}");

            let request = WatchSyncRequest { watch_revision };
            if let Err(error) = app.emit("wear:sync:request", &request) {
                log::error!("wear-sync: failed to emit wear:sync:request event: {error}");
            }
        }
        "/threshold/save_alarm" => {
            match serde_json::from_str::<WatchSaveAlarm>(&msg.data) {
                Ok(save_cmd) => {
                    log::info!(
                        "wear-sync: watch save alarm {} (enabled={}, revision={})",
                        save_cmd.alarm_id,
                        save_cmd.enabled,
                        save_cmd.watch_revision
                    );
                    if let Err(error) = app.emit("wear:alarm:save", &save_cmd) {
                        log::error!("wear-sync: failed to emit wear:alarm:save event: {error}");
                    }
                }
                Err(error) => {
                    log::warn!("wear-sync: invalid save_alarm payload: {error}");
                }
            }
        }
        "/threshold/delete_alarm" => {
            match serde_json::from_str::<WatchDeleteAlarm>(&msg.data) {
                Ok(delete_cmd) => {
                    log::info!(
                        "wear-sync: watch delete alarm {} (revision={})",
                        delete_cmd.alarm_id,
                        delete_cmd.watch_revision
                    );
                    if let Err(error) = app.emit("wear:alarm:delete", &delete_cmd) {
                        log::error!("wear-sync: failed to emit wear:alarm:delete event: {error}");
                    }
                }
                Err(error) => {
                    log::warn!("wear-sync: invalid delete_alarm payload: {error}");
                }
            }
        }
        other => {
            log::warn!("wear-sync: unknown watch message path: {other}");
        }
    }
}

async fn handle_sync_needed(
    publisher: Arc<dyn WearSyncPublisher>,
    collector: Arc<BatchCollector>,
    payload: AlarmsSyncNeeded,
) {
    if let Some((ids, revision)) = collector.flush().await {
        log::info!(
            "wear-sync: cancelled pending batch of {} alarm(s) at revision {} — superseded by immediate sync",
            ids.len(),
            revision
        );
        // Don't publish the batch separately — the immediate publish below
        // sends a complete FullSync with all alarm data, which supersedes
        // any partial batch of IDs.
    }

    publisher.publish_immediate(&payload.reason, payload.revision, payload.all_alarms_json);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SyncReason;
    use crate::publisher::WearSyncPublisher;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Debug)]
    #[allow(dead_code)]
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

        fn publish_immediate(&self, reason: &SyncReason, revision: i64, _all_alarms_json: Option<String>) {
            self.calls
                .lock()
                .unwrap()
                .push(PublishCall::Immediate(reason.clone(), revision));
        }
    }

    #[tokio::test]
    async fn sync_needed_cancels_batch_before_immediate() {
        let publisher = Arc::new(TestPublisher::default());
        let collector = Arc::new(BatchCollector::new(500, publisher.clone()));

        collector.add(vec![9, 10], 40).await;

        let payload = AlarmsSyncNeeded {
            reason: SyncReason::ForceSync,
            revision: 41,
            all_alarms_json: None,
        };

        handle_sync_needed(publisher.clone(), collector, payload).await;

        // The pending batch is cancelled (not published separately) because
        // the immediate FullSync supersedes it with complete alarm data.
        let calls = publisher.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        match &calls[0] {
            PublishCall::Immediate(reason, rev) => {
                assert_eq!(*reason, SyncReason::ForceSync);
                assert_eq!(*rev, 41);
            }
            _ => panic!("expected immediate publish only"),
        }
    }

    #[tokio::test]
    async fn sync_needed_skips_flush_when_nothing_pending() {
        let publisher = Arc::new(TestPublisher::default());
        let collector = Arc::new(BatchCollector::new(500, publisher.clone()));

        let payload = AlarmsSyncNeeded {
            reason: SyncReason::Initialize,
            revision: 1,
            all_alarms_json: None,
        };

        handle_sync_needed(publisher.clone(), collector, payload).await;

        let calls = publisher.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        match &calls[0] {
            PublishCall::Immediate(reason, rev) => {
                assert_eq!(*reason, SyncReason::Initialize);
                assert_eq!(*rev, 1);
            }
            _ => panic!("expected immediate publish only"),
        }
    }

    #[tokio::test]
    async fn sync_needed_handles_reconnect_reason() {
        let publisher = Arc::new(TestPublisher::default());
        let collector = Arc::new(BatchCollector::new(500, publisher.clone()));

        collector.add(vec![1, 2, 3], 10).await;

        let payload = AlarmsSyncNeeded {
            reason: SyncReason::Reconnect,
            revision: 11,
            all_alarms_json: None,
        };

        handle_sync_needed(publisher.clone(), collector, payload).await;

        // Pending batch is cancelled, only immediate publish emitted
        let calls = publisher.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        match &calls[0] {
            PublishCall::Immediate(reason, _) => {
                assert_eq!(*reason, SyncReason::Reconnect);
            }
            _ => panic!("expected immediate publish only"),
        }
    }

    #[tokio::test]
    async fn channel_publisher_integration() {
        use crate::publisher::ChannelPublisher;

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<PublishCommand>();
        let publisher = ChannelPublisher::new(tx);

        publisher.publish_batch(vec![1, 2], 5);
        publisher.publish_immediate(&SyncReason::ForceSync, 6, None);

        let cmd1 = rx.recv().await.unwrap();
        match cmd1 {
            PublishCommand::Batch { ids, revision } => {
                assert_eq!(ids, vec![1, 2]);
                assert_eq!(revision, 5);
            }
            _ => panic!("expected Batch command"),
        }

        let cmd2 = rx.recv().await.unwrap();
        match cmd2 {
            PublishCommand::Immediate { reason, revision, .. } => {
                assert_eq!(reason, SyncReason::ForceSync);
                assert_eq!(revision, 6);
            }
            _ => panic!("expected Immediate command"),
        }
    }

    #[tokio::test]
    async fn batch_collector_with_channel_publisher_end_to_end() {
        use crate::publisher::ChannelPublisher;

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<PublishCommand>();
        let publisher: Arc<dyn WearSyncPublisher> = Arc::new(ChannelPublisher::new(tx));
        let collector = Arc::new(BatchCollector::new(50, Arc::clone(&publisher)));

        // Add items and immediately flush via sync_needed
        collector.add(vec![100, 200], 50).await;

        let payload = AlarmsSyncNeeded {
            reason: SyncReason::BatchComplete,
            revision: 51,
            all_alarms_json: None,
        };

        handle_sync_needed(publisher, collector, payload).await;

        // Pending batch is cancelled, only immediate FullSync is sent
        let cmd = rx.recv().await.unwrap();
        assert!(matches!(cmd, PublishCommand::Immediate { .. }));
    }
}
