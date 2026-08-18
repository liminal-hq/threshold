<!--
Copyright 2026 Liminal HQ
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Issue #255 Phase 3 payload contract

Frozen wire shape for the fired→watch-ring fan-out, so the three parallel Phase 3 branches
(alarm-manager publisher, wear-sync listener, app Rust core) build against identical fields.
This is a working note for the duration of Phase 3 — its content gets folded into
`docs/architecture/event-architecture.md` in Phase 5A and this file is deleted then.

## Kotlin: `alarm-manager:native-fired` bus/Channel payload

The existing `{id, actualFiredAt}` payload gains two fields:

```json
{
	"id": 123,
	"actualFiredAt": 1755100800000,
	"eventId": "b3f1c2a4-...",
	"handledNatively": ["watch-ring"]
}
```

- `eventId` — the `DurableEventQueue` envelope's UUID for this event (stable across the
  immediate-Channel send and the durable-queue copy of the same event).
- `handledNatively` — the set of side-effect tags returned by `NativeEventBus.publish()`'s
  listeners for this event, stamped in at publish time (per the Unified design's "one publish
  path, two delivery planes" decision). Empty array when no native listener handled it (e.g.
  wear-sync's provider hasn't registered yet, or the dev toggle disabled fan-out).

## Rust: `AlarmFired` (`apps/threshold/src-tauri/src/alarm/events.rs`)

Gains one field, `#[serde(default)]` so it deserializes cleanly from any payload that predates
this change (desktop, or a queued pre-Phase-3 event replayed after upgrade):

```rust
pub handled_natively: Vec<String>,
```

This is the struct actually broadcast app-wide as `alarm:fired` (confirmed during planning —
**not** `NativeAlarmFiredPayload`, which is a separate, plugin-local struct in
`plugins/alarm-manager/src/models.rs` used only to deserialize the raw Kotlin Channel payload
inside `mobile.rs`). `NativeAlarmFiredPayload` also gains `event_id: Option<String>` and
`handled_natively: Vec<String>` (`#[serde(default)]` on both) so the tags collected in Kotlin
survive the hop from the Channel payload into the `AlarmFired` event that `report_alarm_fired`
constructs and broadcasts.

Neither struct is ts-rs-annotated (confirmed during planning), so adding these fields does not
trigger `apps/threshold/src/types/alarm.ts` regeneration or its CI drift check.

## Shared constants

- Tag literal for the ring side effect: `"watch-ring"` (exact string, used on both the Kotlin
  publish side and the Rust gating check).
- Staleness window: `90_000` (milliseconds) compared against `actualFiredAt`. Applied
  independently in two places per the Unified design's decision 6: wear-sync's native listener
  (skip the ring side effect, no tag) and wear-sync's Rust `alarm:fired` listener (skip
  `send_alarm_ring`, regardless of tag) — the Rust-side guard alone is what fixes the shipped
  2:30 AM ghost-ring bug retroactively for events queued before this ships.
