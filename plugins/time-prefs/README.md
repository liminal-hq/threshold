# Tauri Plugin Time Prefs

Native Time Preferences for Threshold.

This plugin provides a cross-platform API to retrieve the user's preferred time format (12-hour or 24-hour).

## Android Permissions

This plugin requires the following permissions:

### None Required

- **Purpose:** This plugin uses standard Android APIs (`DateFormat.is24HourFormat`) that do not require any specific manifest permissions.
- **Manifest Injection:** The plugin implements the Threshold manifest injection pattern, but currently injects an empty permission block.

## Setup

1. Add the plugin to your `Cargo.toml`:

```toml
[dependencies]
tauri-plugin-time-prefs = { path = "../../../plugins/time-prefs" }
```

2. Enable the capability in `default.json` (or your app's capability file):

```json
"permissions": [
  "time-prefs:default"
]
```

## Usage

```ts
import { TimePrefs } from '../utils/timePrefs';

const { is24Hour } = await TimePrefs.getSystemTimeFormat();
console.log(`User prefers 24-hour time: ${is24Hour}`);
```
