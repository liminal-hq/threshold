# Tauri Plugin OS Prefs

Native OS preference reads for Threshold -- the custom counterpart to the official `@tauri-apps/plugin-os` (which covers static device info like platform/arch/version): this one covers dynamic user _preferences_ Android exposes that the official plugin doesn't, such as the system time format and animation speed.

Provides:

- The user's preferred time format (12-hour or 24-hour).
- Developer Options' "Animator duration scale" (0x/0.5x/1x/2x/5x/10x), for scaling CSS-driven animations proportionally with a user's chosen debug/accessibility speed.

## Android Permissions

This plugin requires the following permissions:

### None Required

- **Purpose:** This plugin uses standard Android APIs (`DateFormat.is24HourFormat`, `Settings.Global.getFloat`) that do not require any specific manifest permissions.
- **Manifest Injection:** The plugin implements the Threshold manifest injection pattern, but currently injects an empty permission block.

## Setup

1. Add the plugin to your `Cargo.toml`:

```toml
[dependencies]
tauri-plugin-os-prefs = { path = "../../../plugins/os-prefs" }
```

2. Enable the capability in `default.json` (or your app's capability file):

```json
"permissions": [
  "os-prefs:default"
]
```

## Usage

```ts
import { TimeFormatPrefs } from '../utils/timeFormatPrefs';

const { is24Hour } = await TimeFormatPrefs.getSystemTimeFormat();
console.log(`User prefers 24-hour time: ${is24Hour}`);
```

```ts
import { getAnimatorDurationScale } from 'tauri-plugin-os-prefs-api';

const { scale } = await getAnimatorDurationScale();
console.log(`Animations should run at ${scale}x speed`);
```
