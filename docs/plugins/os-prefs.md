# OS Preferences Plugin (`os-prefs`)

**Plugin location:** `plugins/os-prefs/`
**Status:** Active
**Platforms:** Android (native), iOS (stub), Desktop (Intl fallback / static defaults)

> This document describes the `os-prefs` Tauri plugin, which reads native OS *preferences* Android exposes that the official `@tauri-apps/plugin-os` (static device info: platform/arch/version) doesn't cover -- the system time format and animation speed. For plugin development patterns, see [Plugin Manifest Pattern](plugin-manifest-pattern.md).

## Purpose

Tauri v2 does not expose a unified API for these system preferences. This plugin bridges that gap by:

1.  Using native Android APIs (`DateFormat.is24HourFormat`, `Settings.Global.getFloat`).
2.  Providing a stub/roadmap for iOS.
3.  Allowing a desktop fallback (via `Intl` inference for time format; a static default for animation scale, since there's no desktop equivalent setting wired up).

## API

### Frontend

Time format is consumed via `SettingsService` or the `TimePrefs` utility wrapper; animation scale is consumed directly from the plugin's guest-js bindings.

```ts
import { TimePrefs } from '../utils/timePrefs';

const { is24Hour, source } = await TimePrefs.getSystemTimeFormat();
```

- **`is24Hour`**: `boolean` - True if the system prefers 24-hour time.
- **`source`**: `'android' | 'ios' | 'intl'` - Indicates where the preference was derived from.

```ts
import { getAnimatorDurationScale } from 'tauri-plugin-os-prefs-api';

const { scale } = await getAnimatorDurationScale();
```

- **`scale`**: `number` - Android's Developer Options "Animator duration scale" (default `1`).

### Backend (Rust)

The plugin exposes two commands:

- **`get_time_format`**: Returns `{ is24Hour: boolean }`.
- **`get_animator_duration_scale`**: Returns `{ scale: number }`.

## Platform Implementation

### Android

- **Time format source**: `android.text.format.DateFormat.is24HourFormat(context)`
- **Animation scale source**: `Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1.0f)` -- separate from the "Remove animations" accessibility toggle, which zeroes this same value and which Chromium already surfaces to the webview as `prefers-reduced-motion`. Reading the raw scale lets CSS-driven animations scale proportionally with a user's chosen debug/accessibility speed instead of just reduced-motion's on/off.
- **Permissions**: Requires `os-prefs:default` capability.

### iOS

- **Current Status**: Rust-side stub. `get_time_format` returns `false` (12-hour); animation scale always returns `1.0`.
- **Future Work**: Implement Swift native classes to query `DateFormatter`/`Locale` for time format; no known iOS equivalent exists for the animator duration scale.

### Desktop (Linux/macOS/Windows)

- **Time format**: The Rust plugin returns a default `false`. The frontend wrapper (`utils/timePrefs.ts`) detects it is running on desktop and bypasses the plugin to use `Intl.DateTimeFormat().resolvedOptions()` instead (prefers `hourCycle` (`h23`/`h24` => 24h), falls back to `hour12`, defaults to 12-hour).
- **Animation scale**: Always returns `1.0` -- no equivalent desktop setting wired up.

## Setup

Ensure the capability is enabled in `src-tauri/capabilities/default.json`:

```json
"permissions": [
  "os-prefs:default"
]
```
