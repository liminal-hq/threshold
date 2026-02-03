# Plugin Documentation

Specifications and development patterns for Threshold's custom Tauri plugins.

## Plugin Specs

| Plugin | Description | Platforms |
|--------|-------------|-----------|
| [alarm-manager](alarm-manager.md) | Native Android `AlarmManager` integration | Android, Desktop |
| [time-prefs](time-prefs.md) | System time format preferences | Android, iOS, Desktop |
| [wear-sync](wear-sync.md) | Wear OS Data Layer synchronisation | Android (Wear OS) |

## Authoring Patterns

| Document | Purpose |
|----------|---------|
| [plugin-manifest-quickstart](plugin-manifest-quickstart.md) | Quick start template for manifest injection |
| [plugin-manifest-pattern](plugin-manifest-pattern.md) | Full reference for the injection pattern |
| [plugin-manifest-pr-checklist](plugin-manifest-pr-checklist.md) | PR review checklist for plugin changes |

## Reference Implementation

See `plugins/alarm-manager/build.rs` for a complete working example of the manifest injection pattern.
