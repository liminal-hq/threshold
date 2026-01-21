# Time Preferences Plugin (`time-prefs`)

This plugin provides a cross-platform API to retrieve the user's preferred time format (12-hour or 24-hour).

## Purpose

Tauri v2 does not expose a unified API for system time preferences. This plugin bridges that gap by:
1.  Using native Android APIs (`DateFormat.is24HourFormat`).
2.  Providing a stub/roadmap for iOS.
3.  Allowing a desktop fallback via `Intl` inference.

## API

### Frontend

The frontend interacts with this plugin via `SettingsService` or directly through the utility wrapper.

```ts
import { TimePrefs } from '../utils/timePrefs';

const { is24Hour, source } = await TimePrefs.getSystemTimeFormat();
```

- **`is24Hour`**: `boolean` - True if the system prefers 24-hour time.
- **`source`**: `'android' | 'ios' | 'intl'` - Indicates where the preference was derived from.

### Backend (Rust)

The plugin exposes a single command:

- **`get_time_format`**: Returns `{ is24Hour: boolean }`.

## Platform Implementation

### Android
- **Source**: `android.text.format.DateFormat.is24HourFormat(context)`
- **Permissions**: Requires `time-prefs:default` capability.

### iOS
- **Current Status**: Rust-side stub. Returns `false` (12-hour) by default.
- **Future Work**: Implement Swift native class to query `DateFormatter` or `Locale`.

### Desktop (Linux/macOS/Windows)
- **Implementation**: The Rust plugin returns a default `false`.
- **Actual Logic**: The frontend wrapper (`utils/timePrefs.ts`) detects it is running on desktop and bypasses the plugin to use `Intl.DateTimeFormat().resolvedOptions()`.
    - Prefers `hourCycle` (`h23`/`h24` => 24h).
    - Fallback to `hour12`.
    - Default: 12-hour.

## Setup

Ensure the capability is enabled in `src-tauri/capabilities/default.json`:

```json
"permissions": [
  "time-prefs:default"
]
```
