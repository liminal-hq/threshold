# @liminal-hq/plugin-wear-sync

Synchronises alarm data between the Threshold phone app and a Wear OS companion watch via the Wear Data Layer API.

Implements an incremental sync protocol with revision-based conflict detection, batched publishing (500ms debounce), and bidirectional message routing.

## Installation

### Rust

```toml
[dependencies]
tauri-plugin-wear-sync = { path = "../../../plugins/wear-sync" }
```

### Capabilities

```json
"permissions": [
  "wear-sync:default"
]
```

## Usage

### Rust

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_wear_sync::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

The plugin is event-driven — it listens for alarm events and publishes changes automatically. No manual API calls are required from the frontend.

## Architecture

```mermaid
flowchart TD
    subgraph Phone["Phone (Tauri + Rust + Kotlin)"]
        Coord[AlarmCoordinator] -->|emit| Bus[Event Bus]
        Bus -->|alarms:batch:updated| WS[wear-sync Plugin]
        Bus -->|alarms:sync:needed| WS
        WS --> BC[BatchCollector<br/>500ms debounce]
        BC --> CP[ChannelPublisher]
        CP -->|Tauri bridge| KT[WearSyncPlugin.kt<br/>DataClient + MessageClient]
    WMS[WearMessageService.kt] -->|Channel send| WS
    end

    KT <-->|Bluetooth<br/>Wear Data Layer| Watch[Wear OS Watch]
    WMS <-->|Bluetooth<br/>Wear Data Layer| Watch
```

### Outgoing (Phone → Watch)

```mermaid
sequenceDiagram
    participant UI as Threshold UI
    participant Coord as AlarmCoordinator
    participant Bus as Event Bus
    participant WS as wear-sync
    participant BC as BatchCollector
    participant KT as WearSyncPlugin.kt
    participant Watch as Wear OS Watch

    UI->>Coord: save_alarm()
    Coord-->>Bus: alarms:batch:updated
    Bus-->>WS: listener
    WS->>BC: add(ids, revision)
    Note over BC: Start 500ms timer

    UI->>Coord: update_alarm()
    Coord-->>Bus: alarms:batch:updated
    Bus-->>WS: listener
    WS->>BC: add(ids, revision)
    Note over BC: Reset timer

    BC-->>WS: timer expires → ChannelPublisher
    WS->>KT: publish_to_watch(alarmsJson, revision)
    KT->>Watch: PutDataMapRequest → /threshold/alarms
```

### Incoming (Watch → Phone)

```mermaid
sequenceDiagram
    participant Watch as Wear OS Watch
    participant WMS as WearMessageService.kt
    participant KT as WearSyncPlugin.kt
    participant WS as wear-sync (Rust)
    participant App as App Layer

    Watch->>WMS: MessageClient message
    WMS->>KT: onWatchMessage(path, data)
    KT-->>WS: Channel.send(path, data)
    WS->>WS: parse path
    alt /threshold/sync_request
        WS-->>App: emit wear:sync:request
    else /threshold/save_alarm
        WS-->>App: emit wear:alarm:save
    else /threshold/delete_alarm
        WS-->>App: emit wear:alarm:delete
    end
```

## Sync Protocol

Revision-based protocol where the watch sends its `lastSyncRevision` and the phone determines the response:

| Revision Gap | Response | Description |
|--------------|----------|-------------|
| 0 | `UpToDate` | No changes needed |
| 1–100 | `Incremental` | Send only changed/deleted alarms |
| >100 | `FullSync` | Send all alarms |
| Negative (watch ahead) | `FullSync` | Anomaly — phone wins |

## Conflict Detection

Watch edits are validated before applying:

- **`validate_watch_revision()`**: Rejects if watch revision is behind phone
- **`validate_alarm_update()`**: Rejects if alarm was modified after watch last synced

On rejection, the watch receives a conflict error and should trigger a full sync before retrying.

## Permissions

This plugin requires these permissions:

- `allow-publish-to-watch`: Grants access to `publish_to_watch`
- `allow-request-sync-from-watch`: Grants access to `request_sync_from_watch`
- `allow-set-watch-message-handler`: Registers Kotlin → Rust Channel handler
- `allow-mark-watch-pipeline-ready`: Marks watch pipeline readiness before queue drain

### Naming Conventions

- Command identifiers use `snake_case` (for example, `publish_to_watch`).
- Generated permission identifiers use `allow-`/`deny-` prefixes with dash-cased command names (for example, `allow-publish-to-watch`).
- Custom non-command permissions keep plugin-specific names (for example, `allow-event-listeners`).

## Android Permissions

This plugin currently requires no Android permissions. The manifest injection mechanism is in place for future use.

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

## Tests

31 tests across all modules. Run with:

```bash
cargo test -p tauri-plugin-wear-sync
```

## Platform Support

| Platform | Support Level | Notes |
|----------|---------------|-------|
| Linux | Desktop stubs | No-op (no Wear Data Layer) |
| Windows | Desktop stubs | No-op |
| macOS | Desktop stubs | No-op |
| Android | Full | Wear Data Layer via Google Play Services |
| iOS | None | Not implemented |

## Licence

Apache-2.0 OR MIT
