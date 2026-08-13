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
mod commands;
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
    AlarmDismissRequest, AlarmFired, AlarmRingRequest, AlarmSnoozeRequest, AlarmsBatchUpdated,
    AlarmsSyncNeeded, PublishRequest, WatchDeleteAlarm, WatchDismissAlarm, WatchMessage,
    WatchSaveAlarm, WatchSnoozeAlarm, WatchSyncRequest,
};
use publisher::{ChannelPublisher, PublishCommand, WearSyncPublisher};

const BATCH_DEBOUNCE_MS: u64 = 500;

// Per docs/architecture/255-phase3-payload-contract.md's shared constants. Mirrored
// independently (no shared source of truth across languages) by `STALENESS_WINDOW_MS` in
// wear-sync's own Kotlin `NativeFiredListener.kt` -- if you tune this value, tune that one
// too.
const WATCH_RING_TAG: &str = "watch-ring";
const STALENESS_WINDOW_MS: i64 = 90_000;

/// Milliseconds since the Unix epoch, right now. A tiny wrapper so the staleness check
/// below doesn't need a `chrono` dependency this crate doesn't otherwise have.
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Whether a fired event timestamped `actual_fired_at` is too old, relative to `now_ms`, to
/// still be worth ringing the watch for -- per the #255 Phase 3 payload contract's
/// [STALENESS_WINDOW_MS] window. Mirrors `NativeFiredListener.isStale` on the Kotlin side;
/// the two checks are applied independently (see [should_skip_native_watch_ring]'s doc).
fn is_stale(actual_fired_at: i64, now_ms: i64) -> bool {
    now_ms.saturating_sub(actual_fired_at) > STALENESS_WINDOW_MS
}

/// Whether this `alarm:fired` listener should skip calling `send_alarm_ring` for the given
/// event -- per issue #255 Phase 3's Unified design (decision 6). True when either:
/// - `handled_natively` already contains [WATCH_RING_TAG], meaning wear-sync's own Kotlin
///   `NativeFiredListener` already rang the watch in-process before Rust ever saw this
///   event, so ringing again here would double-ring it; or
/// - the event itself is stale (see [is_stale]) -- a durable-queue entry drained long after
///   the alarm actually rang must not ring the watch at all, regardless of who would have
///   handled it. This half of the check, on its own, is what retroactively fixes the
///   shipped "2:30 AM ghost ring" bug, even for events queued before this change ships.
///
/// A pure function of the three fields it needs (not the whole `AlarmFired` event) so it's
/// unit-testable without constructing a full event or touching Tauri at all.
fn should_skip_native_watch_ring(
    handled_natively: &[String],
    actual_fired_at: i64,
    now_ms: i64,
) -> bool {
    handled_natively.iter().any(|tag| tag == WATCH_RING_TAG) || is_stale(actual_fired_at, now_ms)
}

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
        .invoke_handler(tauri::generate_handler![
            commands::get_native_fan_out_enabled,
            commands::set_native_fan_out_enabled,
        ])
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
            let batch_collector = Arc::new(BatchCollector::new(
                BATCH_DEBOUNCE_MS,
                Arc::clone(&publisher),
            ));

            let batch_listener = Arc::clone(&batch_collector);
            app.listen(
                "alarms:batch:updated",
                move |event| match serde_json::from_str::<AlarmsBatchUpdated>(event.payload()) {
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
                },
            );

            let sync_listener = Arc::clone(&batch_collector);
            let sync_publisher = Arc::clone(&publisher);
            app.listen(
                "alarms:sync:needed",
                move |event| match serde_json::from_str::<AlarmsSyncNeeded>(event.payload()) {
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
                },
            );

            // Listen for alarm fired events — notify the watch so it shows
            // the ringing screen in parallel with the phone.
            let ring_app = app.clone();
            app.listen("alarm:fired", move |event| {
                match serde_json::from_str::<AlarmFired>(event.payload()) {
                    Ok(fired) => {
                        // Issue #255 Phase 3B gate: skip this path entirely when the native
                        // (in-process, pre-Rust-boot) listener already rang the watch for
                        // this exact event, or when the event is too old to be worth ringing
                        // for at all -- see should_skip_native_watch_ring's doc.
                        if should_skip_native_watch_ring(
                            &fired.handled_natively,
                            fired.actual_fired_at,
                            now_ms(),
                        ) {
                            log::info!(
                                "wear-sync: skipping send_alarm_ring for id={} (handled_natively={:?}, actual_fired_at={})",
                                fired.id,
                                fired.handled_natively,
                                fired.actual_fired_at
                            );
                            return;
                        }

                        let app = ring_app.clone();
                        tauri::async_runtime::spawn(async move {
                            let wear_sync = app.state::<WearSync<R>>();

                            // Pass hour=None, minute=None to signal the Kotlin side
                            // should use the current device time for the watch display.
                            let request = AlarmRingRequest {
                                alarm_id: fired.id,
                                label: fired.label.unwrap_or_default(),
                                hour: None,
                                minute: None,
                                snooze_length_minutes: fired.snooze_length_minutes,
                                is_24_hour: fired.is_24_hour,
                                is_24_hour_known: fired.is_24_hour_known,
                            };

                            let alarm_id = request.alarm_id;
                            match wear_sync.send_alarm_ring(request) {
                                Ok(()) => {
                                    log::info!(
                                        "wear-sync: sent alarm ring to watch for id={alarm_id}"
                                    );
                                }
                                Err(error) => {
                                    log::error!(
                                        "wear-sync: failed to send alarm ring to watch: {error}"
                                    );
                                }
                            }
                        });
                    }
                    Err(error) => {
                        log::warn!("wear-sync: failed to parse alarm:fired payload: {error}");
                    }
                }
            });

            // Mirror phone alarm dismiss lifecycle to the watch so tapping
            // stop on phone halts watch ringing immediately.
            let dismiss_app = app.clone();
            app.listen("alarm:dismissed", move |event| {
                #[derive(Debug, serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct AlarmDismissed {
                    id: i32,
                }

                match serde_json::from_str::<AlarmDismissed>(event.payload()) {
                    Ok(dismissed) => {
                        let app = dismiss_app.clone();
                        tauri::async_runtime::spawn(async move {
                            let wear_sync = app.state::<WearSync<R>>();
                            let request = AlarmDismissRequest {
                                alarm_id: dismissed.id,
                            };
                            let alarm_id = request.alarm_id;
                            match wear_sync.send_alarm_dismiss(request) {
                                Ok(()) => {
                                    log::info!(
                                        "wear-sync: sent alarm dismiss to watch for id={alarm_id}"
                                    );
                                }
                                Err(error) => {
                                    log::error!(
                                        "wear-sync: failed to send alarm dismiss to watch: {error}"
                                    );
                                }
                            }
                        });
                    }
                    Err(error) => {
                        log::warn!("wear-sync: failed to parse alarm:dismissed payload: {error}");
                    }
                }
            });

            // Mirror phone alarm snooze lifecycle to the watch so tapping
            // snooze on phone halts watch ringing immediately.
            let snooze_app = app.clone();
            app.listen("alarm:snoozed", move |event| {
                #[derive(Debug, serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct AlarmSnoozed {
                    id: i32,
                    original_trigger: i64,
                    snoozed_until: i64,
                }

                match serde_json::from_str::<AlarmSnoozed>(event.payload()) {
                    Ok(snoozed) => {
                        let app = snooze_app.clone();
                        tauri::async_runtime::spawn(async move {
                            let wear_sync = app.state::<WearSync<R>>();
                            let duration_ms = snoozed
                                .snoozed_until
                                .saturating_sub(snoozed.original_trigger);
                            let snooze_length_minutes = (duration_ms / 60_000).max(0) as i32;
                            let request = AlarmSnoozeRequest {
                                alarm_id: snoozed.id,
                                snooze_length_minutes,
                            };
                            let alarm_id = request.alarm_id;
                            match wear_sync.send_alarm_snooze(request) {
                                Ok(()) => {
                                    log::info!(
                                        "wear-sync: sent alarm snooze to watch for id={alarm_id}"
                                    );
                                }
                                Err(error) => {
                                    log::error!(
                                        "wear-sync: failed to send alarm snooze to watch: {error}"
                                    );
                                }
                            }
                        });
                    }
                    Err(error) => {
                        log::warn!("wear-sync: failed to parse alarm:snoozed payload: {error}");
                    }
                }
            });

            // Listen for messages from the watch (routed by Kotlin WearMessageService
            // through WearSyncPlugin → Channel → app.emit("wear:message:received"))
            let watch_app = app.clone();
            app.listen(
                "wear:message:received",
                move |event| match serde_json::from_str::<WatchMessage>(event.payload()) {
                    Ok(msg) => {
                        handle_watch_message(&watch_app, msg);
                    }
                    Err(error) => {
                        log::warn!(
                            "wear-sync: failed to parse wear:message:received payload: {error}"
                        );
                    }
                },
            );

            Ok(())
        })
        .build()
}

/// Mirrors `plugins/alarm-manager/src/lib.rs`'s own `acl_tests` module (added there after
/// issue #195, a prior silent-ACL-denial bug): asserts every webview-invoked command has a
/// matching `allow-*` permission in `permissions/default.toml`, so a command that's wired
/// into `generate_handler!` but not the ACL doesn't silently no-op at runtime the way #195
/// did. wear-sync had no webview commands at all before issue #255 Phase 3B added the
/// native fan-out developer toggle; this module exists specifically so any *future* webview
/// command added to this plugin gets the same automated check for free.
#[cfg(test)]
mod acl_tests {
    // Mirrors the command list passed to `generate_handler!` in `init()` above -- kept as a
    // separate literal because macro invocations aren't readable at test time. If you
    // add/remove a webview command, update both lists.
    const WEBVIEW_COMMANDS: &[&str] = &["get_native_fan_out_enabled", "set_native_fan_out_enabled"];

    const DEFAULT_TOML: &str = include_str!("../permissions/default.toml");

    #[test]
    fn every_webview_command_has_a_default_permission() {
        for command in WEBVIEW_COMMANDS {
            let permission = format!("allow-{}", command.replace('_', "-"));
            assert!(
                DEFAULT_TOML.contains(&permission),
                "command `{command}` is webview-invokable but `permissions/default.toml` \
                 is missing `{permission}` — it will be silently ACL-denied at runtime"
            );
        }
    }

    #[test]
    fn rust_internal_commands_are_not_webview_invokable() {
        // These `build.rs` `COMMANDS` entries are only ever reached via `run_mobile_plugin`
        // from Rust's own code (either this plugin's own setup/listener code, or the app
        // crate calling through `WearSyncExt`), never from the webview -- they must not
        // reappear in `generate_handler!`/`WEBVIEW_COMMANDS`. Per
        // `docs/plugins/command-conventions.md`, listing a Rust-internal command in
        // `COMMANDS` doesn't need an ACL permission (that list only feeds permission *stub
        // generation*, not the ACL check itself), so this predates issue #255 Phase 3B and
        // isn't something this PR needs to fix -- just not regress.
        for internal in [
            "publish_to_watch",
            "request_sync_from_watch",
            "send_alarm_ring",
            "send_alarm_dismiss",
            "send_alarm_snooze",
            "set_watch_message_handler",
            "mark_watch_pipeline_ready",
        ] {
            assert!(
                !WEBVIEW_COMMANDS.contains(&internal),
                "`{internal}` is Rust-internal (via run_mobile_plugin) and must not be \
                 exposed as a webview command"
            );
        }
    }
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
                PublishCommand::Immediate {
                    reason,
                    revision,
                    all_alarms_json,
                    snooze_length_minutes,
                    is_24_hour,
                    is_24_hour_known,
                } => {
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
                        snooze_length_minutes,
                        is_24_hour,
                        is_24_hour_known,
                    };
                    if let Err(error) = wear_sync.publish_to_watch(request) {
                        log::error!(
                            "wear-sync: failed to publish immediate sync to watch: {error}"
                        );
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
        "/threshold/save_alarm" => match serde_json::from_str::<WatchSaveAlarm>(&msg.data) {
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
        },
        "/threshold/delete_alarm" => match serde_json::from_str::<WatchDeleteAlarm>(&msg.data) {
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
        },
        "/threshold/alarm_dismiss" => match serde_json::from_str::<WatchDismissAlarm>(&msg.data) {
            Ok(mut dismiss_cmd) => {
                // event_id isn't part of the watch's own JSON payload -- it's the queue
                // envelope's id, threaded in here from WatchMessage so a same-process dedup
                // pass (issue #255 Phase 3C) has something to key on for this topic too.
                dismiss_cmd.event_id = msg.event_id.clone();
                log::info!("wear-sync: watch dismiss alarm {}", dismiss_cmd.alarm_id);
                if let Err(error) = app.emit("wear:alarm:dismiss", &dismiss_cmd) {
                    log::error!("wear-sync: failed to emit wear:alarm:dismiss event: {error}");
                }
            }
            Err(error) => {
                log::warn!("wear-sync: invalid alarm_dismiss payload: {error}");
            }
        },
        "/threshold/alarm_snooze" => match serde_json::from_str::<WatchSnoozeAlarm>(&msg.data) {
            Ok(mut snooze_cmd) => {
                // See the alarm_dismiss arm above -- same reasoning for threading event_id in.
                snooze_cmd.event_id = msg.event_id.clone();
                log::info!(
                    "wear-sync: watch snooze alarm {} for {} min",
                    snooze_cmd.alarm_id,
                    snooze_cmd.snooze_length_minutes
                );
                if let Err(error) = app.emit("wear:alarm:snooze", &snooze_cmd) {
                    log::error!("wear-sync: failed to emit wear:alarm:snooze event: {error}");
                }
            }
            Err(error) => {
                log::warn!("wear-sync: invalid alarm_snooze payload: {error}");
            }
        },
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

    publisher.publish_immediate(
        &payload.reason,
        payload.revision,
        payload.all_alarms_json,
        payload.snooze_length_minutes,
        payload.is_24_hour,
        payload.is_24_hour_known,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SyncReason;
    use crate::publisher::WearSyncPublisher;
    use std::sync::{Arc, Mutex};

    // ── should_skip_native_watch_ring / is_stale (issue #255 Phase 3B gate) ─────────────

    #[test]
    fn skips_when_handled_natively_contains_the_watch_ring_tag() {
        let handled = vec!["watch-ring".to_string()];
        assert!(should_skip_native_watch_ring(&handled, 1_000, 1_000));
    }

    #[test]
    fn skips_when_handled_natively_contains_the_watch_ring_tag_alongside_others() {
        let handled = vec!["something-else".to_string(), "watch-ring".to_string()];
        assert!(should_skip_native_watch_ring(&handled, 1_000, 1_000));
    }

    #[test]
    fn does_not_skip_when_handled_natively_is_empty_and_event_is_fresh() {
        let handled: Vec<String> = vec![];
        assert!(!should_skip_native_watch_ring(&handled, 1_000, 1_000));
    }

    #[test]
    fn does_not_skip_for_an_unrelated_tag_and_a_fresh_event() {
        let handled = vec!["something-else".to_string()];
        assert!(!should_skip_native_watch_ring(&handled, 1_000, 1_000));
    }

    #[test]
    fn skips_a_stale_event_even_with_no_native_tag() {
        let handled: Vec<String> = vec![];
        // Fired at t=0, "now" is well past the 90s staleness window.
        assert!(should_skip_native_watch_ring(
            &handled,
            0,
            STALENESS_WINDOW_MS + 1
        ));
    }

    #[test]
    fn is_stale_is_false_exactly_at_the_window_boundary() {
        assert!(!is_stale(0, STALENESS_WINDOW_MS));
    }

    #[test]
    fn is_stale_is_true_one_millisecond_past_the_window() {
        assert!(is_stale(0, STALENESS_WINDOW_MS + 1));
    }

    #[test]
    fn is_stale_is_false_for_an_event_fired_in_the_past_within_the_window() {
        assert!(!is_stale(1_000, 1_000 + STALENESS_WINDOW_MS - 1));
    }

    #[test]
    fn is_stale_does_not_panic_on_a_future_actual_fired_at() {
        // Clock skew edge case: actual_fired_at slightly ahead of "now" must not underflow.
        assert!(!is_stale(2_000, 1_000));
    }

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

        fn publish_immediate(
            &self,
            reason: &SyncReason,
            revision: i64,
            _all_alarms_json: Option<String>,
            _snooze_length_minutes: i32,
            _is_24_hour: bool,
            _is_24_hour_known: bool,
        ) {
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
            snooze_length_minutes: 10,
            is_24_hour: false,
            is_24_hour_known: false,
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
            snooze_length_minutes: 10,
            is_24_hour: false,
            is_24_hour_known: false,
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
            snooze_length_minutes: 10,
            is_24_hour: false,
            is_24_hour_known: false,
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
        publisher.publish_immediate(&SyncReason::ForceSync, 6, None, 10, false, false);

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
            PublishCommand::Immediate {
                reason, revision, ..
            } => {
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
            snooze_length_minutes: 10,
            is_24_hour: false,
            is_24_hour_known: false,
        };

        handle_sync_needed(publisher, collector, payload).await;

        // Pending batch is cancelled, only immediate FullSync is sent
        let cmd = rx.recv().await.unwrap();
        assert!(matches!(cmd, PublishCommand::Immediate { .. }));
    }
}
