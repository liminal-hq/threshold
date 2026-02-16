# tauri-plugin-toast

Generic Android-first toast bridge plugin for Tauri v2.

## Purpose

This plugin exposes a minimal command surface to show native toast messages.
It intentionally does not include app-specific alarm logic.

## Command

- `show`
  - payload:
    - `message` (required)
    - `duration` (`short` | `long`, default `short`)
    - `position` (`top` | `centre` | `bottom`, default `bottom`)

## Platform support

- Android: native `Toast`
- Desktop: no-op
- iOS: not currently supported by this plugin
