# Threshold Wear OS Implementation Documentation

## Quick Navigation

### For Implementing Milestone D (wear-sync)
1. **[event-architecture.md](event-architecture.md)** - Authoritative event system specification
2. **[implementation-roadmap.md](implementation-roadmap.md)** - Step-by-step implementation guide
3. **[data-architecture.md](data-architecture.md)** - Data models and sync protocol

### For Understanding Architecture
1. **[architecture.md](architecture.md)** - High-level design philosophy
2. **[event-architecture.md](event-architecture.md)** - Event system deep dive
3. **[flow-diagrams.md](flow-diagrams.md)** - Sequence diagrams

### For Getting Started
1. **[getting-started.md](getting-started.md)** - Quick start guide for contributors

## Current Implementation Status

- ✅ **Milestone A:** Rust Core Infrastructure (COMPLETE)
- ✅ **Milestone B:** TypeScript Migration (COMPLETE)
- ✅ **Milestone C:** Event-Driven Alarm Manager (COMPLETE)
- ❌ **Event System (Phases 1-2):** NOT STARTED - **BLOCKS MILESTONE D**
- 🔄 **Milestone D:** Wear Sync Plugin (IN PROGRESS - BLOCKED)
- 🔄 **Milestone E:** Wear OS App (IN PROGRESS)

### ⚠️ Critical Blocker

The **Level 3 Granular Event System with Revision Tracking** must be implemented before Milestone D can proceed. This work is tracked in GitHub issue [#113](https://github.com/liminal-hq/threshold/issues/113).

**What's Missing:**
- Revision system (monotonic counters, tombstones)
- Event structs (11 semantic events across 4 categories)
- Event emission in AlarmCoordinator
- Incremental sync support

**See:** [event-architecture.md](event-architecture.md) for complete specification and [implementation-roadmap.md](implementation-roadmap.md) Milestone A.5 for implementation steps.

## Document Roles

| Document | Purpose | Audience | Updated |
|----------|---------|----------|---------|
| [event-architecture.md](event-architecture.md) | Authoritative event system spec | Implementers | Feb 1, 2026 |
| [implementation-roadmap.md](implementation-roadmap.md) | Step-by-step implementation guide | Developers | Jan 29, 2026 |
| [architecture.md](architecture.md) | High-level design philosophy | Architects | Jan 29, 2026 |
| [data-architecture.md](data-architecture.md) | Data models and schemas | Backend devs | Jan 29, 2026 |
| [flow-diagrams.md](flow-diagrams.md) | Visual sequence diagrams | All | Jan 29, 2026 |
| [getting-started.md](getting-started.md) | Quick start guide | New contributors | Jan 23, 2026 |
| [ui-mockups.md](ui-mockups.md) | Wear OS app designs | UI/UX | Jan 23, 2026 |

## Implementation Phases

### Phase 1: Revision System (3-4 hours)
- Database migration v2 (revision tables, tombstones)
- Add revision tracking to AlarmRecord
- Implement incremental sync queries

**Files:** `alarm/models.rs`, `alarm/database.rs`, `alarm/mod.rs`

### Phase 2: Event Structs (2-3 hours)
- Populate `alarm/events.rs` with 11 event types
- CRUD Events (3): created, updated, deleted
- Scheduling Events (2): scheduled, cancelled
- Lifecycle Events (3): fired, dismissed, snoozed
- Batch Events (2): batch:updated, sync:needed

**Files:** `alarm/events.rs`

### Phase 3: Event Emission (3-4 hours)
- Integrate event emission in AlarmCoordinator
- Add heal-on-launch lifecycle hook
- Add tombstone maintenance

**Files:** `alarm/mod.rs`, `lib.rs`

### Phase 4: Testing (2-3 hours)
- Unit tests (revision increments, stamping, queries)
- Integration tests (event emission, DevTools verification)

**Total Estimated Effort:** 10-12 hours

## Key Concepts

### Revision System
Every alarm has a monotonic revision number. Global counter increments on every change. Enables:
- Conflict detection (reject stale watch updates)
- Incremental sync (query changes since revision X)
- Deleted alarm tracking (tombstones)

### Granular Events
Instead of one `alarms:changed` snapshot event (1200 bytes), emit 11 semantic events (40-220 bytes each):
- More efficient (80 bytes vs 1200 bytes for scheduling)
- No diffing needed (plugins know exact action)
- Enables batching (wear-sync buffers 5 edits → 1 sync)

### Batch Collector Pattern
wear-sync plugin listens to `alarms:batch:updated`, buffers changes, debounces for 500ms, then syncs once. Prevents watch spam during rapid editing.

## Related Repositories

- **Main App:** `liminal-hq/threshold` (this repo)
- **Wear OS App:** Will be in `apps/wear-app/` (Milestone E)
- **Plugins:** `plugins/alarm-manager/`, `plugins/wear-sync/`

## Questions?

- **GitHub Issues:** https://github.com/liminal-hq/threshold/issues
- **Current Tracking Issue:** [#113 - Implement Event System](https://github.com/liminal-hq/threshold/issues/113)
- **Milestone Tracking:** [Wear OS Companion Support](https://github.com/liminal-hq/threshold/milestone/X)

---

**Ready to implement? Start with [event-architecture.md](event-architecture.md) → [implementation-roadmap.md](implementation-roadmap.md) Milestone A.5** 🚀
