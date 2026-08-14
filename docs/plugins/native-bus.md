# Native Event Bus Plugin (`native-bus`)

**Plugin location:** `plugins/native-bus/`
**Status:** Active
**Plugin crate:** `tauri-plugin-native-bus`
**Platforms:** Android (native); no-op on Desktop, no iOS implementation

> This document describes the `native-bus` Tauri plugin, a shared substrate carrying the
> Android `NativeEventBus`/`DurableEventQueue` Kotlin sources used by `alarm-manager` and
> `wear-sync`. For the full event flow this substrate enables (fired -> watch-ring,
> dismiss/snooze -> stop), see [Event Architecture](../architecture/event-architecture.md#native-event-bus-android-issue-255).
> For the wider channel-bridge pattern this is the canonical write-up of, see the "Ideas"
> section of `docs/audits/2026-07-07-repo-audit.md` (issue #209).

## Purpose

Every Tauri event in this app only exists once Rust has booted. On Android, a cold process
start can take Rust several seconds to catch up — long enough that time-sensitive native
work (most notably, ringing a paired watch the instant an alarm fires) needs a path that
doesn't wait for it. `native-bus` provides that path: it lets one Android plugin's native
Kotlin code talk directly to another plugin's native Kotlin code, in-process, with no
dependency on Rust or the WebView having started.

This crate itself carries **no webview-invokable commands** and exposes no meaningful Rust
API today (`NativeBusExt` exists only so a future caller has somewhere to hang state). Its
entire purpose is to bring `android/` — the shared Kotlin sources below — into the
generated Gradle project graph, so `alarm-manager` and `wear-sync` can each depend on it as
a Gradle project dependency (`implementation(project(":tauri-plugin-native-bus"))` in their
own `build.gradle.kts`).

## The two mechanisms

`plugins/native-bus/android/src/main/java/ca/liminalhq/threshold/nativebus/` contains two
independent, reusable pieces:

- **`NativeEventBus`** — a process-wide singleton in-process pub/sub bus, shared
  automatically by every plugin that imports it. `publish()` is synchronous, on the caller's
  thread, and fire-and-forget: an event with no listener registered is silently dropped. See
  [Event Architecture's threading contract](../architecture/event-architecture.md#nativeeventbus)
  for the full KDoc-sourced contract listeners must honour.
- **`DurableEventQueue`** — a generic, reusable "persist to `SharedPreferences` until Rust
  drains it" log. Unlike `NativeEventBus`, this is **not** a singleton: `alarm-manager` and
  `wear-sync` each instantiate their own `DurableEventQueue(store, prefsKey)` with a
  distinct key, backed by one schema-versioned JSON array. This is what actually guarantees
  delivery to Rust, however long boot takes.

A single logical event typically travels down both planes at once: durably enqueued for
Rust's eventual, guaranteed processing, and separately published on `NativeEventBus` for any
in-process listener that wants to react instantly. See
[Event Architecture](../architecture/event-architecture.md#native-event-bus-android-issue-255)
for the full topic table, the `handled_natively` tag mechanism, and the concrete
fired->watch-ring and dismiss/snooze->stop flows built on top of these two pieces.

## Plugin Structure

```
plugins/native-bus/
├── src/
│   ├── lib.rs          # Plugin entry point; NativeBusExt trait; no commands
│   ├── mobile.rs        # Android init (no PluginHandle — see lib.rs's NativeBusExt KDoc)
│   ├── desktop.rs       # No-op stub for desktop compilation
│   └── error.rs
├── android/
│   ├── build.gradle.kts
│   └── src/
│       ├── main/java/.../nativebus/
│       │   ├── NativeEventBus.kt       # Process-wide pub/sub singleton
│       │   ├── DurableEventQueue.kt    # Per-plugin durable queue class
│       │   └── KeyValueStore.kt        # Storage abstraction DurableEventQueue is built on
│       └── test/java/.../nativebus/    # NativeEventBusTest, DurableEventQueueTest
├── build.rs
└── Cargo.toml
```

## Consumers

`alarm-manager` and `wear-sync` are the only two consumers today. Each:

- Depends on this crate's Gradle module via `implementation(project(":tauri-plugin-native-bus"))`.
- Instantiates its own `DurableEventQueue` over its own `SharedPreferences` key
  (alarm-manager's `eventQueue(context)`; wear-sync's `WearSyncEventQueue`).
- Registers its own `NativeEventBus` listeners from a dedicated `ContentProvider`
  (`WearRingInitProvider` in wear-sync, `WatchStopInitProvider` in alarm-manager) whose
  `onCreate()` is guaranteed to run before any other Android component, even on a cold
  multi-plugin process start. See
  [Event Architecture's ContentProvider section](../architecture/event-architecture.md#the-contentprovider-registration-pattern)
  for why this pattern is used instead of, say, `Application.onCreate()`.

Both plugins migrated an older, hand-rolled queue implementation onto `DurableEventQueue` as
a one-way step — see the `RELEASE_NOTES.md` "Unreleased" note and the Gotchas entry in the
root `CLAUDE.md`.

## Direct Cargo dependency requirement

`apps/threshold/src-tauri/Cargo.toml` depends on `tauri-plugin-native-bus` directly, even
though nothing calls `.plugin()` on it in a meaningful way. This is required, not
incidental: Cargo's `links`/`DEP_*_ANDROID_LIBRARY_PATH` metadata (which `tauri-build`'s
`generate_gradle_files()` reads to auto-add a plugin's `android/` directory to the generated
`tauri.settings.gradle`/`app/tauri.build.gradle.kts`) only propagates to **direct**
dependents of a crate, not transitively through `alarm-manager`/`wear-sync`'s own Gradle
project dependency on it. Without the app crate depending on `native-bus` directly, its
`android/` module would never be added to the generated Android project graph in the first
place, and `alarm-manager`/`wear-sync`'s `project(":tauri-plugin-native-bus")` reference
would fail to resolve.

## Platform Support

- **Android:** Full implementation — this is the only platform either mechanism runs on
  today.
- **Desktop:** `src/desktop.rs` is a no-op stub. Desktop has no equivalent cold-boot gap (no
  separate native process to race against), so there is nothing for this plugin to do there.
- **iOS:** The envelope/topic contract (`Envelope`'s JSON shape, topic-string vocabulary) is
  kept platform-neutral by design, but there is no iOS Kotlin/Swift implementation of either
  mechanism yet. iOS alarms and Wear-equivalent companion sync are out of scope for now.

## Tests

Kotlin unit tests cover both classes directly, independent of any Android framework:

- `NativeEventBusTest` — subscribe/publish ordering, tag collection, listener failure
  isolation (a throwing listener doesn't block delivery to the others).
- `DurableEventQueueTest` — enqueue/drain/commit/clear round-trips, schema-version
  tolerance, and malformed-entry skipping, against an in-memory `KeyValueStore` fake.

Run with the same Kotlin test job that covers `alarm-manager`/`wear-sync`
(`test-kotlin-plugins` in CI).
