# Wear OS Sync Plugin

**Status:** Implemented
**Milestone:** D — Wear Sync Plugin
**Plugin crate:** `tauri-plugin-wear-sync`

## Overview

The `wear-sync` plugin synchronises alarm data between the Threshold phone app and Wear OS companion watch using the Wear Data Layer API. It implements an **incremental sync protocol with revision-based conflict detection** to ensure data consistency across devices while minimising bandwidth and battery usage.

### Key Features

- **Batch Collector Pattern**: Debounces rapid alarm edits (500ms) to prevent watch spam
- **Incremental Sync**: Syncs only changes since last known revision
- **Conflict Detection**: Rejects stale watch updates using revision comparison
- **Tombstone Tracking**: Handles deleted alarms correctly across restarts
- **FullSync Payloads**: All publishes send complete alarm state (~200 bytes/alarm, well under 100 KB DataItem limit)
- **No JNI**: Uses Tauri's auto-generated `@Command` / `@InvokeArg` bridge

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Threshold Phone App                       │
│  ┌────────────────┐      ┌──────────────────────────────┐  │
│  │ AlarmCoordinator│──────│ Event Bus (Tauri)            │  │
│  │  - save_alarm  │      │  - alarms:batch:updated      │  │
│  │  - delete_alarm│      │  - alarms:sync:needed        │  │
│  │  - toggle_alarm│      │  - wear:message:received     │  │
│  └────────────────┘      └──────────┬───────────────────┘  │
│                                      │                       │
│                           ┌──────────▼───────────────────┐  │
│                           │ wear-sync Plugin (Rust)      │  │
│                           │  - BatchCollector (500ms)    │  │
│                           │  - ChannelPublisher          │  │
│                           │  - SyncProtocol              │  │
│                           │  - ConflictDetector          │  │
│                           └──────────┬───────────────────┘  │
│                                      │ Tauri bridge          │
│                           ┌──────────▼───────────────────┐  │
│                           │ WearSyncPlugin.kt            │  │
│                           │  - DataClient (publish)      │  │
│                           │  - MessageClient (request)   │  │
│                           │  - NodeClient (discovery)    │  │
│                           └──────────┬───────────────────┘  │
│                                      │                       │
│                           ┌──────────▼───────────────────┐  │
│                           │ WearMessageService.kt        │  │
│                           │  - Incoming watch messages   │  │
│                           │  - Routes to plugin trigger  │  │
│                           └──────────┬───────────────────┘  │
└──────────────────────────────────────┼──────────────────────┘
                                       │ Bluetooth
                                ┌──────▼─────────┐
                                │  Wear OS Watch  │
                                │  - DataClient   │
                                │  - MessageClient│
                                └────────────────┘
```

## Plugin Structure

```
plugins/wear-sync/
├── src/
│   ├── lib.rs                 # Plugin entry point, event listeners, message routing
│   ├── batch_collector.rs     # 500ms debounce buffer with publisher integration
│   ├── publisher.rs           # WearSyncPublisher trait + ChannelPublisher
│   ├── sync_protocol.rs       # Incremental sync logic (UpToDate/Incremental/FullSync)
│   ├── conflict_detector.rs   # Revision validation for watch updates
│   ├── models.rs              # Shared types (bridge requests, watch messages, events)
│   ├── error.rs               # Error types (ConflictError, etc.)
│   ├── mobile.rs              # Android bridge via Tauri PluginHandle
│   └── desktop.rs             # No-op stubs for desktop compilation
├── android/
│   ├── build.gradle.kts       # play-services-wearable + coroutines
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/.../wearsync/
│           ├── WearSyncPlugin.kt      # @TauriPlugin with @Command methods
│           ├── WearMessageService.kt  # WearableListenerService for incoming
│           ├── WearSyncService.kt     # Foreground service for offline writes
│           └── WearSyncCache.kt       # SharedPreferences helper for offline reads
├── build.rs
└── Cargo.toml
```

## Data Flow

### Phone → Watch (Outgoing)

1. `AlarmCoordinator` emits `alarms:batch:updated` event
2. `BatchCollector` buffers alarm IDs for 500ms
3. On debounce expiry, `ChannelPublisher` sends `PublishCommand::Batch` via mpsc channel
4. Background task emits `wear:sync:batch_ready` event
5. App crate listener calls `AlarmCoordinator.emit_sync_needed(BatchComplete)` which fetches all alarms
6. `alarms:sync:needed` fires with `allAlarmsJson` → `PublishCommand::Immediate` → `SyncResponse::FullSync`
7. Tauri bridges to `WearSyncPlugin.publishToWatch()` (Kotlin)
8. Kotlin writes `PutDataMapRequest` to `/threshold/alarms` via `DataClient`
9. Watch `DataLayerListenerService` receives the `DataItem` change

**Note:** Both batch and immediate paths produce a `FullSync` envelope with all alarm data. The batch collector still debounces rapid changes, but the final payload is always a complete snapshot. This is acceptable because alarm payloads are small (~200 bytes per alarm, <4 KB for 15 alarms, well under the 100 KB DataItem limit).

### Watch → Phone (Incoming)

1. Watch sends `MessageClient` message to phone
2. `WearMessageService.kt` receives message, routes by path
3. Calls `WearSyncPlugin.onWatchMessage()` → triggers `wear:message:received` Tauri event
4. Rust `handle_watch_message()` parses path and re-emits structured event:
   - `/threshold/sync_request` → `wear:sync:request`
   - `/threshold/save_alarm` → `wear:alarm:save`
   - `/threshold/delete_alarm` → `wear:alarm:delete`
5. App crate listeners (`apps/threshold/src-tauri/src/lib.rs`) handle the event via `AlarmCoordinator`:
   - `wear:alarm:save` → `toggle_alarm(id, enabled)` → saves + re-publishes to watch
   - `wear:alarm:delete` → `delete_alarm(id)` → deletes + re-publishes to watch
   - `wear:sync:request` → `emit_sync_needed(ForceSync)` → publishes FullSync to watch

## Sync Protocol

The sync protocol is revision-based. The watch sends its `last_sync_revision` and the phone determines the response type:

| Revision Gap | Response | Description |
|--------------|----------|-------------|
| 0 | `UpToDate` | No changes needed |
| 1–100 | `Incremental` | Send only changed/deleted alarms |
| >100 | `FullSync` | Send all alarms |
| Negative (watch ahead) | `FullSync` | Anomaly — phone wins |

### SyncResponse JSON Format

The `SyncResponse` enum uses PascalCase type tags and camelCase field names to match the watch-side Kotlin parser:

```json
{"type":"FullSync","currentRevision":42,"allAlarms":[...]}
{"type":"Incremental","currentRevision":50,"updatedAlarms":[...],"deletedAlarmIds":[...]}
{"type":"UpToDate","currentRevision":42}
```

Rust serde: `#[serde(tag = "type", rename_all = "PascalCase")]` with per-field `#[serde(rename = "camelCase")]`.

### Immediate Publish (FullSync)

When `alarms:sync:needed` fires (app startup, force sync, reconnect), the `AlarmCoordinator` fetches all alarms from the DB and includes the pre-serialized JSON in the event payload (`allAlarmsJson`). The publish task wraps this in a `SyncResponse::FullSync` envelope before sending to the watch.

## Conflict Detection

Watch edits are validated before applying:

- **`validate_watch_revision()`**: Rejects if watch revision is behind phone revision
- **`validate_alarm_update()`**: Rejects if specific alarm was modified after watch last synced

On rejection, the watch receives a conflict error and should trigger a full sync before retrying.

## Offline Sync

For details on how sync works when the phone app is closed (SharedPreferences cache for reads, foreground service for writes), see [architecture/wear-os-companion.md](../architecture/wear-os-companion.md).

## Kotlin Commands

| Command | Description |
|---------|-------------|
| `publishToWatch` | Write alarm data to Wear Data Layer `DataItem` |
| `requestSyncFromWatch` | Send sync request message to all connected watch nodes |

## Events

### Listened

| Event | Source | Purpose |
|-------|--------|---------|
| `alarms:batch:updated` | AlarmCoordinator | Batched alarm changes |
| `alarms:sync:needed` | AlarmCoordinator | Force immediate sync |
| `wear:message:received` | WearSyncPlugin.kt | Incoming watch messages |

### Emitted

| Event | Target | Purpose |
|-------|--------|---------|
| `wear:sync:request` | App layer | Watch wants sync data |
| `wear:alarm:save` | App layer | Watch wants to toggle alarm |
| `wear:alarm:delete` | App layer | Watch wants to delete alarm |
| `wear:sync:batch_ready` | App layer | Batch debounce expired, needs full alarm data |

### Handled by App Layer

The app crate (`apps/threshold/src-tauri/src/lib.rs`) listens for the four events above and routes them through `AlarmCoordinator`:

| Event | Handler |
|-------|---------|
| `wear:alarm:save` | `coordinator.toggle_alarm(id, enabled)` |
| `wear:alarm:delete` | `coordinator.delete_alarm(id)` |
| `wear:sync:request` | `coordinator.emit_sync_needed(ForceSync)` |
| `wear:sync:batch_ready` | `coordinator.emit_sync_needed(BatchComplete)` |

## Tests

31 tests across all modules:

- **batch_collector** (3): debounce coalescing, concurrent merge, flush clears
- **sync_protocol** (12): all boundary conditions, JSON serialisation round-trips
- **conflict_detector** (8): stale rejection, current acceptance, edge cases
- **publisher** (3): channel send batch/immediate, closed channel handling
- **lib integration** (5): sync needed flush, empty flush, reconnect, channel publisher e2e, batch+channel e2e

Run with: `cargo test -p tauri-plugin-wear-sync`

## Performance Targets

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Watch sync (<10 alarms) | <500ms | <2s |
| Incremental sync | <500ms | <1s |
| Full sync | <2s | <5s |
| Conflict detection | <100ms | <500ms |

## Related Issues

- [#82](https://github.com/nicholasgasior/threshold/issues/82) — Watch message handling
- [#114](https://github.com/nicholasgasior/threshold/issues/114) — Conflict detection
- [#115](https://github.com/nicholasgasior/threshold/issues/115) — Mobile/desktop bridge
- [#116](https://github.com/nicholasgasior/threshold/issues/116) — Sync protocol
- [#117](https://github.com/nicholasgasior/threshold/issues/117) — Integration tests
