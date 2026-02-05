# Tauri Plugin Wear Sync

Wear OS sync integration for Threshold.

This plugin listens for alarm batch events and coordinates debounced sync signals for the Wear Data Layer.

## Android Permissions

This plugin currently requires no Android permissions.

- **Purpose:** The current scaffolding only listens for events and schedules sync work.
- **Manifest Injection:** The plugin implements the Threshold manifest injection pattern and injects an empty permission block for future use.

## Setup

1. Add the plugin to your `Cargo.toml`:

```toml
[dependencies]
tauri-plugin-wear-sync = { path = "../../../plugins/wear-sync" }
```

2. Enable the capability in your app capability file:

```json
"permissions": [
  "wear-sync:default"
]
```

## Behaviour

- `alarms:batch:updated` events are debounced for 500 ms before triggering a sync publish.
- `alarms:sync:needed` events trigger an immediate sync publish.

## Diagrams

### Event Flow

```mermaid
flowchart LR
    UI[Threshold UI] -->|save/update alarm| Core[AlarmCoordinator]
    Core -->|emit alarms:batch:updated| Bus[Event Bus]
    Core -->|emit alarms:sync:needed| Bus
    Bus -->|batch listener| WearSync[wear-sync Plugin]
    WearSync -->|debounce 500 ms| Collector[BatchCollector]
    Collector -->|publish batch| Publisher[Wear Data Layer Publisher]
    WearSync -->|immediate sync| Publisher
    Publisher --> Watch[Wear OS Watch]
```

### Debounce Timing

```mermaid
sequenceDiagram
    participant UI as UI
    participant Core as AlarmCoordinator
    participant Bus as Event Bus
    participant WS as wear-sync
    participant Collector as BatchCollector
    participant Watch as Wear OS

    UI->>Core: save_alarm()
    Core-->>Bus: alarms:batch:updated
    Bus-->>WS: alarms:batch:updated
    WS->>Collector: add(ids, revision)
    Note over Collector: Start 500 ms timer

    UI->>Core: update_alarm()
    Core-->>Bus: alarms:batch:updated
    Bus-->>WS: alarms:batch:updated
    WS->>Collector: add(ids, revision)
    Note over Collector: Reset timer

    Collector-->>WS: timer expires
    WS-->>Watch: publish batch sync

    UI->>Core: request_sync()
    Core-->>Bus: alarms:sync:needed
    Bus-->>WS: alarms:sync:needed
    WS-->>Watch: publish immediate sync
```
