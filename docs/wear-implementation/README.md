# Wear OS Companion Documentation

Wear OS-specific design and UI documentation for Threshold.

## Contents

| Document | Description |
|----------|-------------|
| [ui-mockups](ui-mockups.md) | Wear OS watch app UI designs and layout specs |

## Status

- **Milestone D (wear-sync plugin):** Blocked on event system implementation ([#113](https://github.com/liminal-hq/threshold/issues/113))
- **Milestone E (Wear OS app):** UI design complete

## Core Architecture

The core architecture that underpins the Wear OS companion lives in [architecture/](../architecture/):

- **[Event Architecture](../architecture/event-architecture.md)** - Event system spec (drives wear-sync)
- **[Implementation Roadmap](../architecture/implementation-roadmap.md)** - Milestones D and E cover Wear OS
- **[Data Architecture](../architecture/data-architecture.md)** - Data models and sync protocol
- **[Flow Diagrams](../architecture/flow-diagrams.md)** - Sequence diagrams including Wear sync flows

## Related

- **[wear-sync plugin spec](../plugins/wear-sync.md)** - Plugin implementation guide
- **[Wear OS app target](../architecture/implementation-roadmap.md)** - `apps/wear-app/` (Milestone E)
