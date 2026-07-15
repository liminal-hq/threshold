# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in
this repository.

## Project

Threshold is a minimalist alarm clock for Android and Desktop (Tauri v2, React + MUI)
with a Wear OS companion app. Its signature feature is Random Window mode: the alarm
fires at a random minute inside a user-defined window.

See `AGENTS.md` for the authoritative coding standards — most importantly: **Canadian
English** spelling everywhere (UI strings, variables, comments, commits, docs);
**Conventional Commits**; the required licence/copyright header on every source file;
**no barrel files**; and plugin Android permissions injected via `build.rs`. See
`SPEC.md` and `README.md` for product behaviour.

## Layout

pnpm workspace monorepo + Cargo workspace:

- `apps/threshold` — the Tauri app: React frontend in `src/`, Rust backend in
  `src-tauri/` (`src-tauri/gen/android` is generated Gradle — don't hand-edit)
- `apps/threshold-wear` — native Kotlin/Compose Wear OS app (own Gradle project)
- `apps/site` — static landing page
- `packages/core` — shared TS types only (`@threshold/core/types`); production
  scheduling is Rust (see below). `AlarmMode`'s member names must match Rust's enum
  variant names (`Fixed`/`Window`) exactly, since it's referenced by the generated
  types below via `#[ts(type = "AlarmMode")]`
- `plugins/*` — custom Tauri plugins (alarm-manager, wear-sync, theme-utils,
  os-prefs, predictive-back, toast, app-management), each with Rust `src/` and Kotlin `android/`
- `vendor/tauri-plugins-workspace` — submodule for the vendored notification plugin

## Commands

```bash
pnpm install                      # setup (Node 20+, pnpm, Rust stable)
pnpm dev:desktop                  # run desktop app
pnpm dev:android                  # run on Android (needs SDK/NDK)
pnpm test                         # all workspace JS/TS tests (vitest run, single pass)
pnpm --filter threshold test:watch  # app tests in watch mode
pnpm -r run typecheck              # tsc --noEmit across all TS packages (CI-gated; vitest alone won't catch type errors)
cargo test --workspace            # Rust tests (app + plugins)
pnpm format                       # prettier
pnpm build:desktop | build:android | build:wear
pnpm version:release              # interactive release TUI (phone + wear versions); supports
                                   # `-- --ci --bump <patch|minor|major|x.y.z>` for scripted/agent use
                                   # -- see docs/infrastructure/release-build.md for the full runbook
```

CI (`.github/workflows/test.yml`) runs a TS type-check, vitest, and `cargo nextest` with
JUnit output.

## Architecture — the key things to understand

**Rust owns alarm state; the event hub is the spine.** `AlarmCoordinator`
(`apps/threshold/src-tauri/src/alarm/`) is the single writer to SQLite (via
tauri-plugin-sql migrations). Every mutation bumps a monotonic **revision**, writes
tombstones on delete, and emits granular Tauri events in a fixed order: CRUD event
(`alarm:created/updated/deleted`) → scheduling event (`alarm:scheduled` /
`alarm:cancelled`) → `alarms:batch:updated`. `docs/architecture/event-architecture.md`
is the reference; keep it in lockstep with code changes.

**Native Android scheduling is driven from TypeScript, not Rust.**
`AlarmManagerService.syncNativeAlarms` (frontend) listens for `alarms:batch:updated`,
diffs against its signature map, and calls `invoke('plugin:alarm-manager|schedule/cancel')`.
The alarm-manager plugin's `alarms:changed` listener and `update_alarms` code are dead
(nothing emits that event) — don't build on them. Next-trigger computation lives in
`src-tauri/src/alarm/scheduler.rs`.

**Kotlin talks to Rust through Channels, not the webview.** The house pattern
(established in wear-sync, reused in alarm-manager): Rust registers a `Channel` with
the Kotlin plugin at init (`run_mobile_plugin("set_*_handler", …)`); Kotlin sends
events through it via JNI; events received before the app is ready are queued in
SharedPreferences and drained after Rust calls `mark_*_pipeline_ready`. Follow this
pattern for any new native→Rust signal; don't route through JS.

**Alarm firing path (Android):** `AlarmUtils.scheduleAlarm` (`setAlarmClock` +
SharedPreferences for boot recovery) → `AlarmReceiver` → `AlarmRingingService`
(foreground service: audio, vibration, full-screen notification deep-linking to
`threshold://ringing/<id>`) → plugin channel → Rust `report_alarm_fired` → emits
`alarm:fired` → wear-sync mirrors ringing to the watch. Desktop uses tokio timers in
`alarm-manager/src/desktop.rs` emitting `alarm-ring`.

**Dismiss/snooze from the notification also go straight to Rust.** `AlarmRingingService`'s
Dismiss/Snooze actions post through the same channel pattern
(`alarm-manager:dismiss-requested` / `alarm-manager:snooze-requested`), handled directly
in `lib.rs` — mirrors `wear:alarm:dismiss`/`wear:alarm:snooze`, no TS involvement, per the
Channels rule above. Snooze reads `SnoozeLengthState` (Rust's own copy of the snooze-length
setting, kept in sync via `set_snooze_length`) rather than depending on TS to compute the
anchor. The confirmation toast is a separate concern: `AlarmManagerService` listens for
`alarm:snoozed` unconditionally so every snooze source (native, watch, upcoming
notification, in-app) gets the same toast, rather than each call site publishing its own.

**Wear sync:** phone publishes FullSync snapshots to the Data Layer at
`/threshold/alarms` (revision-stamped); the watch sends mutations back as messages
(`/threshold/save_alarm`, `delete_alarm`, `sync_request`, `alarm_dismiss`,
`alarm_snooze`). Watch-originated writes are rejected if their revision is stale, which
forces a resync. The incremental-sync modules (`sync_protocol.rs`,
`conflict_detector.rs`) exist but are not wired up — everything is FullSync today.

## Plugin development

Read `/docs/plugins/plugin-manifest-quickstart.md` before touching a plugin. Rules that
bite: plugins own their Android permissions via `update_android_manifest()` in
`build.rs`; the `COMMANDS` list + `permissions/default.toml` must cover every command
the **webview** invokes (Rust-side `run_mobile_plugin` calls bypass the ACL); new
plugins must be added to the root `Cargo.toml` workspace members and registered in
`apps/threshold/src-tauri/src/lib.rs`. TS calls plugin commands with raw
`invoke('plugin:<name>|<command>')` strings — grep for the command name across
`src/services/` when renaming anything. See `/docs/plugins/command-conventions.md` for
the full `COMMANDS`-scope rule and the Kotlin `@Command` naming convention (camelCase).

## Gotchas

- Capabilities live in `apps/threshold/src-tauri/capabilities/*.json`; a plugin command
  that works in Rust can still be ACL-denied from TS, and service code often swallows
  the error — check the ACL first when an invoke "does nothing".
- The Wear app and phone plugin share the `/threshold/*` message path strings by
  convention (duplicated constants in `WearSyncPlugin.kt` and
  `apps/threshold-wear/.../WearDataLayerClient.kt`) — change both together.
- `docs/audits/` holds point-in-time repo audits; check the latest before re-deriving
  known issues.
- `apps/threshold/src/types/alarm.ts` (`AlarmRecord`/`AlarmInput`) is **generated**
  from `alarm/models.rs` via `ts-rs` — don't hand-edit it. A Rust test
  (`alarm::models::ts_bindings`) fails CI if the committed file drifts from a fresh
  generation; regenerate with
  `UPDATE_TS_BINDINGS=1 cargo test -p threshold ts_bindings -- --nocapture` after
  changing an annotated field. `AlarmMode` itself stays hand-maintained in
  `packages/core/src/types.ts` (ts-rs doesn't generate runtime TS enums, only
  type-only unions, and this codebase relies on `AlarmMode` as a real enum object) —
  keep its variant names in sync with Rust's by hand.
