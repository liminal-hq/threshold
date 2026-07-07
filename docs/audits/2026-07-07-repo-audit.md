# Threshold Repository Audit — 7 July 2026

Full-repo audit focused on the Kotlin ↔ Rust ↔ TypeScript boundaries, Tauri v2 plugin
shape, open PRs, and Liminal HQ house-rule compliance (benchmarked against Flow and
Spindle). All findings verified against `main` at `3ed6d5a`.

**Test baseline:** TypeScript 40/40 pass, Rust workspace passes (exit 0). The suites are
green — every bug below is a logic/wiring gap the suites don't cover.

**Tracking:** epic [#193](https://github.com/liminal-hq/threshold/issues/193) with
sub-issues #194–#210 covering every actionable finding, including blocking
relationships (#198 ← #197, #205 ← #204).

---

## Executive summary

Threshold's core architecture is genuinely good: a Rust `AlarmCoordinator` owns state,
revisions, and a granular event vocabulary, and the wear-sync plugin is the strongest
piece of engineering in the repo. The main structural problem is that the codebase is
mid-migration between two architectures — an older TS-driven scheduling model and the
newer event-driven Rust hub — and several seams between them are dead, half-wired, or
silently broken. The native Android layer has real reliability gaps (notification
dismiss never re-arms repeating alarms; overnight windows are a regression). House-rule
compliance lags Flow/Spindle: ~85 files missing licence headers, barrel files, no
CLAUDE.md (fixed on this branch), CI lint/format checks commented out.

---

## The Good

- **The Rust event hub.** `AlarmCoordinator` (`apps/threshold/src-tauri/src/alarm/`)
  is a clean single-writer design: monotonic revisions, tombstones with 30-day
  maintenance, granular events (`alarm:created/updated/deleted/scheduled/cancelled`,
  `alarms:batch:updated`, `alarm:fired`, `alarms:sync:needed`), and watch-originated
  mutations guarded by revision checks (`lib.rs` rejects stale watch saves/deletes and
  forces a resync). The event ordering discipline (CRUD → scheduling → batch) is
  documented and followed.

- **wear-sync is the house pattern in embryo.** Kotlin → Rust via a Tauri `Channel`
  over JNI, bypassing the webview entirely; a persisted queue (`WearSyncQueue`) plus a
  `mark_watch_pipeline_ready` handshake so messages received before app setup replay
  instead of dropping; a `WearSyncPublisher` trait with a channel-backed implementation
  and a debounced `BatchCollector`, all with real unit tests. alarm-manager has since
  adopted the same channel+queue+ready pattern for native-fired events (and PR #192
  extends it to snooze). This pattern deserves a write-up in `docs/plugins/` as the
  canonical way Threshold plugins talk to Rust — it is better than anything in the
  official Tauri examples.

- **Android manifest injection.** Every plugin owns its permissions via
  `update_android_manifest()` in `build.rs`, exactly as `AGENTS.md` mandates, and the
  docs (`docs/plugins/plugin-manifest-*.md`) match the code.

- **Defensive native code.** `BootReceiver` reschedules from SharedPreferences and
  cleans expired entries; `AlarmRingingService` uses a silent notification channel with
  manual audio/vibration and a wake lock; the ringing full-screen intent deep-links to
  `threshold://ringing/<id>`.

- **Documentation density.** `docs/architecture/event-architecture.md`,
  `flow-diagrams.md`, plugin specs, and PR checklists are unusually thorough. The docs
  correctly describe the *intended* system — the gaps below are places where code
  didn't finish catching up.

---

## The Bad — bugs, ranked

### 1. Notification "Dismiss" never re-arms a repeating alarm (reliability)

`AlarmRingingService`'s Dismiss action sends `ACTION_DISMISS` → `stopSelf()`. Nothing
notifies Rust/TS, so `dismiss_alarm` never runs, `next_trigger` stays in the past, and
`syncNativeAlarms` cancels the (stale) native schedule without recomputing. **A daily
alarm dismissed from the notification will not ring the next day** until the user opens
the app and touches that alarm. Same applies to the TS `onDismissRinging` handler
(`AlarmManagerService.ts:172`), which only calls `stopRinging()`.

*Fix:* mirror PR #192's snooze design — a `dismiss-requested` channel event from the
service through the plugin, handled in TS by `AlarmService.dismiss(id)` (which already
recalculates via `calculate_next_trigger_after`). PR #192 adds `ALARM_ID` to the
dismiss intent but still doesn't consume it; flag in review.

### 2. `check_active_alarm` is doubly broken

- TS invokes `plugin:alarm-manager|check_active_alarm`
  (`AlarmManagerService.ts:216`) but `allow-check-active-alarm` is in neither
  `permissions/default.toml` (only 5 of 8 commands listed) nor any capability file —
  the ACL denies it at runtime and `.catch(() => null)` swallows the error silently.
- Even if permitted, nothing ever sets the `isAlarmTriggered` intent extra it reads
  (`AlarmManagerPlugin.kt:214`); the ringing launch path moved to the
  `threshold://ringing/<id>` deep link long ago.

*Fix:* delete the command and its callsite (the deep-link path is the real one), or —
if you want an extras-based fallback — add the permission and set the extra in the
full-screen intent.

### 3. The event-driven native-scheduling path is dead code

`plugins/alarm-manager/src/lib.rs:65` listens for `alarms:changed`, but **nothing emits
that event anywhere** (TS, Rust, or Kotlin — `docs/architecture/event-architecture.md`
even says the granular system *replaced* it). Consequences:

- `AlarmManager::update_alarms` (mobile diff logic *and* the desktop implementation)
  is unreachable, along with the plugin's `scheduled_ids` bookkeeping.
- `heal_on_launch` (`alarm/mod.rs:362`) re-emits `alarm:scheduled` "to heal the
  SharedPreferences cache" — but no listener for `alarm:scheduled` exists anywhere, so
  heal-on-launch is a no-op that logs success.
- Real scheduling is TS-driven: `AlarmManagerService.syncNativeAlarms` on
  `alarms:batch:updated`. This works, but it means native schedules only update while
  the webview is alive.

*Fix (pick one, deliberately):*
- **Finish the migration:** have the plugin listen to `alarm:scheduled` /
  `alarm:cancelled` (Rust-side), drop `syncNativeAlarms`, and make heal-on-launch
  real. This also removes the webview-alive dependency.
- **Or bless the TS-driven path:** delete `setup_event_listener`, `update_alarms`
  (both platforms), `scheduled_ids`, and the misleading heal comments. PR #192 already
  moves TS toward consuming `alarm:cancelled`, which fits either direction.

### 4. Overnight windows are a silent regression

`scheduler.rs:91` returns `Err("Window end must be after start")`, and `EditAlarm.tsx`
has no window-order validation, so saving a 23:30 → 00:15 alarm shows the generic
"Failed to save alarm. Please try again." The abandoned TS scheduler
(`packages/core/src/scheduler.ts`) *and* the archived design doc
(`docs/archive/ALARM_RINGING_LOGIC_MAIN.md`, "Overnight windows are supported in this
branch") both handled midnight crossing, including the check-yesterday's-window case.

*Fix:* port the overnight logic (and its tests) into `scheduler.rs`; until then,
validate in `EditAlarm` with a proper message.

### 5. The scheduler can't fire inside an already-open window

`scheduler.rs:108` requires `window_start > now`. Enable a 07:00–07:30 alarm at 07:10
and it schedules *next* occurrence (tomorrow/next week) instead of sampling the
remaining 20 minutes. The legacy TS scheduler handled this (sample from
`max(now + 30s, windowStart)` with a `MIN_LEAD_SECONDS` floor). Same porting job as #4.
Also minor: `gen_range(0..window_duration_mins)` can never pick the final minute of the
window; the TS version's span was inclusive.

### 6. `packages/core` is a dead scheduler with living tests

Only `types.ts` is imported from `@threshold/core`; `scheduler.ts` (196 lines, the most
featureful scheduler in the repo) and `scheduler.test.ts` run green in CI while testing
nothing that ships. That's actively misleading — a passing "scheduler" suite that
doesn't cover production scheduling. *Fix:* port the missing behaviour to Rust (#4/#5),
then delete `scheduler.ts` + its tests, leaving `@threshold/core` as a types-only
package (or fold types into the app).

### 7. theme-utils breaks non-Android mobile builds

`plugins/theme-utils/src/mobile.rs` calls `api.register_android_plugin(...)` without an
`#[cfg(target_os = "android")]` gate (and its `PLUGIN_IDENTIFIER` const *is* gated, so
iOS compilation fails twice over). time-prefs and toast gate correctly; alarm-manager
and app-management use a different-but-working `api.handle().clone()` fallback.
Harmless today (no iOS builds) but it's the one plugin that forecloses the option.

### 8. Import parsing eats labels with `|` and retries forever

`get_launch_args` (`AlarmManagerPlugin.kt:243`) splits the persisted payload on `"|"`
and only removes the prefs entry when `parts.size == 2`. An alarm labelled
`"Gym | Leg day"` (via the `SET_ALARM` intent) fails parsing *and is never cleaned up*,
so it re-fails on every launch. Use `split("|", limit = 2)` and remove the entry on
parse failure too. Related nits in `SetAlarmActivity`: `EXTRA_DAYS` ignored, random
ID from `currentTimeMillis % Int.MAX_VALUE`, and with `EXTRA_SKIP_UI` the temporary
native alarm stays scheduled until the app next opens (double-ring window).

### 9. `AlarmService.subscribe` clobbers earlier subscribers

`AlarmService.ts:17` assigns `this.unlistenFns = [unlisten]` (static), so a second
subscriber discards the first's cleanup handle → listener leak. Append instead, or
return per-subscription cleanup only.

### 10. `event_logs.rs` truncation is disabled

`MAX_EVENT_LOG_BYTES: usize = usize::MAX` (`event_logs.rs:5`) makes the whole
`truncate_to_limit` machinery a no-op — presumably a debugging value that shipped. It
also does synchronous `fs` I/O inside an async command (PR #148 fixes exactly this) and
is missing its licence header.

### 11. Minor / hygiene bugs

- **`vitest` watch mode in `pnpm test`:** `apps/threshold`'s `test` script runs plain
  `vitest`, which stays in watch mode locally ("Waiting for file changes…"). CI is
  saved by the `CI` env var. Use `vitest run`.
- **Blocking `run_mobile_plugin` on async threads:** wear-sync's publish task and event
  listeners call `run_mobile_plugin` (synchronous; Kotlin resolves after Data Layer
  I/O) from `tauri::async_runtime::spawn` contexts, tying up runtime threads. Fine at
  current volume; wrap in `spawn_blocking` if watch traffic grows.
- **Watch snooze length is recomputed, not carried:** `wear-sync/src/lib.rs:194`
  derives minutes from `snoozed_until - original_trigger`, which drifts when the alarm
  fired late. Carry the requested minutes in the event payload.
- **Shared `PendingIntent` request codes + single `NOTIFICATION_ID = 999`:** two
  simultaneously ringing alarms clobber each other's notification and actions. If
  single-ring is the design, enforce it explicitly; PR #192's snooze intent
  (requestCode 1) inherits the same collision.
- **Static `instance` holds the `Activity`:** `AlarmManagerPlugin` / `WearSyncPlugin`
  companions retain the activity reference indefinitely. Low impact in a
  single-activity app, but prefer `applicationContext` for anything the services call.
- **No auto-silence in the native service:** the wake lock caps at 10 minutes but
  `MediaPlayer` loops indefinitely (`START_STICKY`). The `silenceAfter` setting only
  works if the webview Ringing screen is open. Implement the timeout in
  `AlarmRingingService` for parity.
- **`plugins/app-management` is not a workspace member** (`Cargo.toml`), so
  `cargo test --workspace` never touches it.
- **Desktop plugin code uses `println!`/`eprintln!`** (`alarm-manager/desktop.rs`,
  `theme-utils/desktop.rs`, `time-prefs/desktop.rs`) instead of `log::`.

---

## The Ugly — structure and drift

### ACL / COMMANDS drift (alarm-manager is the worst)

| Command | `build.rs` COMMANDS | `default.toml` | Invoked from TS | Verdict |
|---|---|---|---|---|
| `schedule`, `cancel`, `get_launch_args`, `pick_alarm_sound`, `stop_ringing` | ✅ | ✅ | ✅ | correct |
| `check_active_alarm` | ✅ | ❌ | ✅ | **broken at runtime** (Bad #2) |
| `set_alarm_event_handler`, `mark_alarm_pipeline_ready` | ✅ | ❌ | ❌ (Rust-side only) | shouldn't be in COMMANDS at all |
| `set_snooze_event_handler` (PR #192) | ❌ | ❌ | ❌ | works (Rust-side), confirms the list is vestigial |

`run_mobile_plugin` bypasses the ACL, so Rust-internal commands don't belong in
`COMMANDS`. wear-sync's `default.toml` also invents an `allow-event-listeners`
permission that maps to no command. Decide the convention: *COMMANDS = webview-invokable
surface only*, and regenerate the autogenerated permission docs.

### Mixed command naming across the Kotlin bridge

`stop_ringing`, `minimize_app`, `publish_to_watch` (snake_case) vs `pickAlarmSound`,
`getMaterialYouColours`, `getTimeFormat` (camelCase). Tauri matches on exact string, so
both work — but pick one (upstream plugins use camelCase Kotlin methods; your newer
plugins trend snake_case to match the Rust command names). Same story for Kotlin
package naming: `com.plugin.*` (alarm-manager, app_management, themeutils, toast) vs
`ca.liminalhq.threshold.*` (time-prefs, wear-sync — the newer, correct style, matching
the `ca.liminalhq.threshold` app id), plus a third namespace in intent actions
(`com.threshold.ALARM_TRIGGER`, `com.threshold.ACTION_DISMISS`).

### Dead weight

- `wear-sync/src/conflict_detector.rs` and `sync_protocol.rs` are `#[allow(dead_code)]`
  modules; the sync protocol supports incremental sync but every path forces
  `FullSync` (acknowledged in a `lib.rs` comment). The `Batch` publish command is
  vestigial too — it just emits `batch_ready`, which round-trips into an immediate
  FullSync. Either keep them as documented roadmap (they're good code) or cut them.
- `packages/core/scheduler.ts` (Bad #6).
- `emit('alarm-update')` / `listen('alarm-update')` is a TS→TS event used only for the
  desktop ringing window; fine, but it lives beside 11 Rust-owned events with a
  different naming style (`alarm-update` vs `alarm:updated` — one hyphen away from a
  very confusing bug).
- Capability `windows: ["alarm-ring-*", "test-alarm-*"]` patterns in `default.json`
  reference window labels that no longer exist (the code uses `ringing-window`);
  harmless because `"*"` is also present, which makes the specific patterns doubly
  pointless.
- Root clutter: `gemini-backup.tar.gz` (119 MB, untracked), `release/` (458 MB,
  untracked), `docs/ui/redesigns/...temp-review-maybe-delete.md` (untracked PR #190
  leftover), committed `gemini-utils.sh`, stray per-plugin `Cargo.lock` files in
  `plugins/alarm-manager` and `plugins/time-prefs` (workspace members use the root
  lock).

### CI gaps

`cargo fmt --check`, `cargo clippy`, and `pnpm format:check` are all commented out in
`.github/workflows/test.yml`. Flow's standard is clippy with `-D warnings`. There is
also no licence-header check despite it being a hard AGENTS.md requirement (see
compliance below).

---

## Tauri v2 plugin shape — vs the official template and Spindle

Spindle's plugins (`tauri-plugin-display-awareness`, `tauri-plugin-spindle-project`)
follow the full upstream template: `guest-js/` + `rollup.config.js` + `package.json` +
`dist-js/`, typed npm bindings consumed by the app. Threshold's plugins predate that
standard:

| Plugin | guest-js | npm pkg | desktop impl | mobile cfg-gating | ACL correct | licence headers |
|---|---|---|---|---|---|---|
| alarm-manager | ❌ | ❌ | real (tokio timers) | ✅ (handle fallback) | ❌ (Bad #2) | partial |
| wear-sync | ❌ (Rust-only surface) | ❌ | no-op | ✅ | odd extras | ✅ mostly |
| theme-utils | ❌ | ❌ | stub | ❌ **broken** | ✅ | ❌ |
| time-prefs | ❌ | ❌ | stub | ✅ | ✅ | ❌ |
| app-management | ❌ | ❌ | ❌ none (mobile-only) | ✅ | ✅ | ❌ |
| toast | ✅ (no pkg/rollup) | ❌ | error stub | ✅ | ✅ | ❌ |

Consequences of the missing guest-js layer show up in the app: raw
`invoke('plugin:x|cmd')` strings are scattered across services, and
`AlarmManagerService.ts:23` hand-redeclares `ImportedAlarm` with the comment *"Define
the plugin invoke types manually since we can't import from the plugin in this
environment"* — that's the template's `guest-js` bindings package solving exactly this.

**Recommendation:** don't retrofit all six at once. When a plugin's surface next
changes (alarm-manager will, via PR #192), add its `guest-js` bindings + workspace
`package.json` in the same PR, and migrate callsites from raw strings to the typed
binding. wear-sync legitimately needs no JS bindings (its surface is Rust↔Kotlin) —
document that as an accepted variant. Also consider `ts-rs` or `specta` on the Rust
models so `types/alarm.ts` (currently hand-mirrored from `alarm/models.rs`) is
generated, not maintained.

Other template deltas worth adopting: `rust-toolchain.toml` (Spindle has one, Threshold
doesn't), plugin directory naming (`plugins/tauri-plugin-*` in Spindle vs bare names
here — cosmetic, your call).

### Boundary serialisation notes (Rust ↔ Kotlin)

- `PickAlarmSoundOptions`: Rust `Option<bool>` fields serialise as JSON `null`, which
  Jackson can reject for Kotlin's non-nullable `Boolean = true` defaults. TS currently
  always passes concrete values, so it works — add
  `#[serde(skip_serializing_if = "Option::is_none")]` to make the contract safe.
- `AlarmRingRequest.hour/minute`: the Kotlin `< 0` → "use device time" convention is
  fed by Rust hard-coding `-1` — it works, but the Kotlin defaults (`0`) would silently
  render 00:00 if a field were ever omitted. Make the fields `Option<i32>`/nullable
  Int for an honest contract.
- Everything else lines up cleanly: camelCase `serde(rename_all)` matches `@InvokeArg`
  property names throughout, and the wear message paths (`/threshold/*`) are consistent
  across `WearSyncPlugin.kt`, `lib.rs`, and the watch app.

---

## Open PR review (8)

| PR | Verdict | Notes |
|---|---|---|
| **#192** ghost notification + ringing snooze | **Land soon** (after nits) | Directly fixes audit Bad #1-adjacent races: `isAlarmLive` guard in `AlarmReceiver`, absolute `snoozed_until` timestamps (now-anchored vs trigger-anchored), snooze-from-notification channel reusing the wear-sync pattern, TS consumption of `alarm:cancelled`. Review nits: (a) dismiss intent gains `ALARM_ID` but `ACTION_DISMISS` still never dismisses in the DB — Bad #1 survives this PR; (b) `set_snooze_event_handler` not added to `build.rs` COMMANDS — fine functionally, but pick the convention (see ACL drift); (c) snooze `PendingIntent` requestCode 1 shares the multi-alarm collision. |
| **#190** UI redesign | **Decide: rebase or split** | 4 months stale, +6250/−434 but mergeable. Your working tree still holds an untracked leftover from it (`docs/ui/redesigns/.../temp-review-maybe-delete.md`). Its docs/specs subtree is valuable regardless of the UI outcome — consider landing docs separately if the UI needs rework against #192. |
| **#178** snooze array hoist | **Close** | The diff is empty (+0/−0) — the change no longer exists against main. |
| **#168** CI Kotlin tests | **Rebase and land** | Conflicting (AGENTS.md + workflow drift). Valuable coverage, but note it runs plugin tests from `src-tauri/gen/android` (a generated Gradle project) — fragile; prefer the plugins' own `android/` Gradle projects if possible. |
| **#150** checkImports N+1 | **Close, re-fix fresh** | Written against the pre-Rust-coordinator API (`databaseService.getAllAlarms`), unmergeable. But the bug it targets still exists in today's code: `checkImports` calls `AlarmService.getAll()` inside the import loop (`AlarmManagerService.ts:338`). A 3-line hoist on current main replaces the PR. |
| **#149** Home sync storage read | **Close or redo small** | Conflicting; `Home.tsx:30` still does a synchronous `localStorage` read per render, so the concern is real but trivial in cost. If redone, skip the added perf-test file. |
| **#148** async event log export | **Rebase and land** | Mergeable and still correct (`event_logs.rs` is sync I/O in an async command). While touching the file: fix `MAX_EVENT_LOG_BYTES = usize::MAX` (Bad #10) and add the licence header. |
| **#13** predictive back | **Close; resurrect the idea** | Predates the `apps/window-alarm` → `apps/threshold` rename, based on another long-dead feature branch, conflicting. The `tauri-plugin-predictive-back` design (Kotlin `OnBackAnimationCallback` → events) is worth rebuilding fresh on the current plugin pattern. |

Cross-cutting PR hygiene vs house rules: #178/#150/#149/#148 have no labels (Spindle's
AGENTS.md requires release-note category labels; Threshold's AGENTS.md predates that
section) and use `⚡ Optimize …` titles — emoji-prefixed, American spelling, and
process-flavoured, all counter to the PR-title rules.

---

## House-rules compliance (vs Flow/Spindle standards)

| Rule | Status |
|---|---|
| Canadian English | ✅ Good in code/docs (`colours`, `initialise`, `behaviour`); ❌ bot PR titles ("Optimize") |
| Licence headers on all source files | ❌ **~85 files missing** — all of `packages/core`, most TS components/screens/utils, most plugin Rust `commands/desktop/error/lib/models.rs`, several Kotlin files (`AlarmUtils.kt`, `AlarmRingingService.kt`, `BootReceiver.kt`, `SetAlarmActivity.kt`, all small-plugin Kotlin), `event_logs.rs`. PR #192 adds two — the rest need a sweep. Audit command: `for f in $(git ls-files '*.rs' '*.kt' '*.ts' '*.tsx' \| grep -v gen/); do head -5 "$f" \| grep -q SPDX \|\| echo "$f"; done` |
| No barrel files | ❌ `components/ContextMenu/index.ts`, `components/TimePicker/index.ts`, `components/Icons/index.tsx` |
| Conventional commits | ✅ Recent history is clean |
| PR titles human-readable, no prefixes | ✅ #192/#190/#168/#13; ❌ the ⚡ bot PRs |
| Don't push unasked | ✅ (workflow rule, noted) |
| Licence identity | ⚠️ Threshold headers say `Apache-2.0 OR MIT`; Flow/Spindle use `MIT`. If deliberate (app vs library split?), document it in AGENTS.md; if drift, pick one. |

**AGENTS.md is a generation behind Spindle's.** Worth back-porting: PR content rules
(`## Summary`/`## Test plan` format, no internal workflow artefacts, ready-for-review
default), the PR **labels** section (Threshold's release workflow now categorises
release notes, so labels matter here too), `fix/issue-<n>-<desc>` branch naming, the
`ghcr.io/liminal-hq/tauri-dev-desktop:latest` container fallback for Rust tooling, and
the "update README/SPEC when behaviour changes" rule. Flow additionally treats
`cargo clippy -- -D warnings` as required — Threshold's CI has it commented out.

A `CLAUDE.md` modelled on Flow's (project summary → defer to AGENTS.md → commands →
architecture → the one data-flow subtlety that isn't obvious) is added on this branch.

---

## Ideas (beyond bug fixes)

1. **Re-arm safety net.** Handle `ACTION_LOCKED_BOOT_COMPLETED`, `TIME_SET`, and
   `TIMEZONE_CHANGED` in `BootReceiver` (alarm apps must survive clock/timezone
   changes), and consider a periodic `WorkManager` job that compares SharedPreferences
   against `AlarmManager.getNextAlarmClock()` as a last-resort heal.
2. **Extract the channel-bridge pattern.** wear-sync's queue + pipeline-ready +
   JNI-channel design is now used three times (watch messages, native-fired, PR #192
   snooze). Write it up in `docs/plugins/` and consider a tiny shared Kotlin helper so
   the queue/drain code isn't copy-pasted per event type.
3. **Generated TS types.** `ts-rs` or `specta` on `alarm/models.rs` + plugin models
   kills the hand-mirrored `types/alarm.ts` and the "can't import plugin types" comment.
4. **Native alarm-clock affordances.** `AlarmManager.getNextAlarmClock()` already
   surfaces your `setAlarmClock` to the OS; consider `SHOW_ALARMS` intent handling and
   a home-screen widget using the same data as the Wear tile/complication.
5. **CI:** re-enable fmt/clippy/prettier gates; add the licence-header check as a
   script (`scripts/check-headers.sh`) so the ~85-file backlog can't regrow; make
   `pnpm test` non-interactive (`vitest run`).
6. **Decide wear-sync's incremental-sync future.** Either schedule the
   `sync_protocol`/`conflict_detector` work (they're tested and shaped for it) or
   delete them and enjoy FullSync simplicity. The current half-state costs
   comprehension on every read.

---

## Suggested sequencing

1. Land #192 (with the dismiss-parity follow-up), #148 (rebased, with the
   `usize::MAX` fix), #168 (rebased). Close #178, #150, #149, #13 with a note.
2. Fix the four cheap correctness items: `check_active_alarm` removal, `vitest run`,
   `AlarmService.subscribe`, import-label parsing.
3. Do the scheduler port (overnight windows + in-window sampling) with the legacy TS
   tests translated to Rust, then delete `packages/core/scheduler.ts`.
4. Pick a direction for Bad #3 (event-driven vs TS-driven native scheduling) and
   delete the losing half.
5. Header sweep + barrel-file removal + CI gates + AGENTS.md refresh in one hygiene PR.
