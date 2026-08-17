# Tauri Plugin Home Widgets

Android home-screen widget support for Threshold, showing the next scheduled alarm.

This plugin listens for the core `alarm:next-changed` event (emitted by `AlarmCoordinator`'s scheduler whenever the next-due alarm changes) and forwards a flattened snapshot to the Kotlin plugin's `updateWidgetSnapshot` handler via `run_mobile_plugin`, so a home-screen widget (`HomeWidgetsPlugin`, package `ca.liminalhq.threshold.homewidgets`) can render it without any webview involvement.

## Wire contract

Incoming core event `alarm:next-changed`:

```json
{ "alarm": { "id": 3, "label": "Weekday Alarm", "triggerAt": 1755500040000 } | null, "is24Hour": true | null }
```

Outgoing payload to `HomeWidgetsPlugin.updateWidgetSnapshot` (flat, camelCase):

```json
{ "alarmId": 3 | null, "label": "…" | null, "triggerAt": … | null, "is24Hour": … | null }
```

## No webview surface

`COMMANDS` in `build.rs` is empty by design. This plugin has no `#[command]`s and is never invoked from TS -- it only pushes data from Rust to the native widget. `updateWidgetSnapshot` is a Rust-internal call, not a webview-facing command, so it must not appear in `COMMANDS` or `permissions/default.toml`. See `docs/plugins/command-conventions.md` for the rule this follows.

## Android permissions

None required -- the plugin only updates a home-screen widget's `RemoteViews`, a standard platform API with no manifest permission of its own.

## Setup

1. Add the plugin to your `Cargo.toml`:

```toml
[dependencies]
tauri-plugin-home-widgets = { path = "../../../plugins/home-widgets" }
```

2. Register it in `lib.rs`:

```rust
.plugin(tauri_plugin_home_widgets::init())
```

No capability entry is needed -- there is no webview-facing command surface to grant.
