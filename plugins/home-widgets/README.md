# Tauri Plugin Home Widgets

Android home-screen widget support for Threshold, showing the next scheduled alarm.

This plugin listens for the core `alarm:next-changed` event (emitted by `AlarmCoordinator`'s scheduler whenever the next-due alarm changes) and forwards a flattened snapshot to the Kotlin plugin's `updateWidgetSnapshot` handler via `run_mobile_plugin`, so a home-screen widget (`HomeWidgetsPlugin`, package `ca.liminalhq.threshold.homewidgets`) can render it without any webview involvement.

## Wire contract

Incoming core event `alarm:next-changed`:

```json
{
  "alarm": { "id": 3, "label": "Weekday Alarm", "triggerAt": 1755500040000 } | null,
  "is24Hour": true | null,
  "theme": { "light": { "fill": "#ffffff", "...": "..." }, "dark": { "fill": "#2a364b", "...": "..." } } | null
}
```

`theme: null` means "not pushed yet" -- the app's startup seed emission fires before the webview loads its own theme -- not "clear the theme". The Kotlin side keeps its last persisted theme in that case; see `WidgetTheme.kt` and `NextAlarmWidget.saveTheme`.

Outgoing payload to `HomeWidgetsPlugin.updateWidgetSnapshot` (flat, camelCase):

```json
{ "alarmId": 3 | null, "label": "…" | null, "triggerAt": … | null, "is24Hour": … | null, "themeJson": "{\"light\":{...},\"dark\":{...}}" | null }
```

`themeJson` carries the `theme` sub-object serialized to a compact JSON string rather than a nested object -- Kotlin's `@InvokeArg` binding is only proven for flat scalar fields in this codebase. This plugin never interprets the theme's roles; it only deserializes it opaquely in Rust and forwards the exact string to Kotlin, which parses and persists it.

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
