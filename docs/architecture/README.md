# Architecture Documentation

Core application architecture for Threshold — event system, data models, and implementation roadmap.

## Contents

| Document | Description |
|----------|-------------|
| [event-architecture](event-architecture.md) | Authoritative event system specification (Level 3 granular events) |
| [architecture](architecture.md) | High-level design philosophy and system overview |
| [data-architecture](data-architecture.md) | Data models, schemas, and sync protocol |
| [flow-diagrams](flow-diagrams.md) | Sequence diagrams for alarm lifecycle and sync flows |
| [getting-started](getting-started.md) | Quick start guide for contributors |
| [implementation-roadmap](implementation-roadmap.md) | Step-by-step milestone plan (A through E) |
| [wear-os-companion](wear-os-companion.md) | Wear OS companion architecture: sync protocol, offline reads/writes |

## Quick Navigation

**Implementing the event system?**
1. [event-architecture.md](event-architecture.md) — full specification
2. [implementation-roadmap.md](implementation-roadmap.md) — Milestone A.5 steps

**Understanding the design?**
1. [architecture.md](architecture.md) — design philosophy
2. [flow-diagrams.md](flow-diagrams.md) — visual sequence diagrams

## Current Status

- Milestones A-C: Complete (Rust core, TS migration, event-driven alarm manager)
- Milestone A.5 (event system): Not started — tracked in [#113](https://github.com/liminal-hq/threshold/issues/113)
- Milestones D-E (Wear OS): Blocked on A.5 — see [wear-implementation/](../wear-implementation/)

## Related

- **[Plugin specs](../plugins/)** — alarm-manager, time-prefs, wear-sync
- **[Wear OS docs](../wear-implementation/)** — UI mockups and Wear-specific design
