# Wear OS Companion Documentation

Wear OS-specific design and UI documentation for Threshold.

## Contents

| Document | Description |
|----------|-------------|
| [ui-mockups](ui-mockups.md) | Wear OS watch app UI designs and layout specs |
| [testing-guide](testing-guide.md) | Building, installing, ADB usage, log reading, and end-to-end testing |
| [../plugins/wear-sync.md](../plugins/wear-sync.md) | wear-sync plugin implementation guide |

## Status

- **Milestone D (wear-sync plugin):** Complete — batch collector, sync protocol, conflict detection, Kotlin Data Layer bridge, watch message routing, 31 tests
- **Milestone E (Wear OS app):** Complete — standalone app at `apps/threshold-wear/` with alarm list UI, Data Layer client, tile, and complication

## Architecture Overview

The Wear OS support consists of two components:

### Phone-side: `plugins/wear-sync/`

A Tauri plugin that bridges the Rust alarm system with the Wear Data Layer API. Runs inside the main Threshold Android app.

- **Outgoing**: Listens for alarm change events → batches them (500ms debounce) → publishes to watch via `DataClient`
- **Incoming**: Receives watch messages via `WearMessageService` → routes to Rust event handlers → app layer processes

### Watch-side: `apps/threshold-wear/`

A standalone Android Wear OS app that runs on the watch hardware. Communicates with the phone purely through the Wear Data Layer — no Rust involved on the watch side.

- **Receives**: `DataItem` changes at `/threshold/alarms` → updates local `AlarmRepository`
- **Sends**: `MessageClient` messages for sync requests, alarm toggles, alarm deletes
- **UI**: Compose for Wear OS with `ScalingLazyColumn`, alarm cards, sync status header
- **Tile**: Shows next alarm time on the watch face tile carousel
- **Complication**: Provides next alarm time for watch face complications

## Core Architecture

The core architecture that underpins the Wear OS companion lives in [architecture/](../architecture/):

- **[Event Architecture](../architecture/event-architecture.md)** — Event system spec (drives wear-sync)
- **[Implementation Roadmap](../architecture/implementation-roadmap.md)** — Milestones D and E cover Wear OS
- **[Data Architecture](../architecture/data-architecture.md)** — Data models and sync protocol
- **[Flow Diagrams](../architecture/flow-diagrams.md)** — Sequence diagrams including Wear sync flows
