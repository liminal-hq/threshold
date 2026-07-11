# Plugin Documentation

Specifications and development patterns for Threshold's custom Tauri plugins.

## Plugin Specs

| Plugin                                | Description                                | Platforms              |
| ------------------------------------- | ------------------------------------------ | ---------------------- |
| [alarm-manager](alarm-manager.md)     | Native Android `AlarmManager` integration  | Android, Desktop       |
| [app-management](app-management.md)   | Mobile lifecycle management (minimise app) | Android, iOS (stubbed) |
| [os-prefs](os-prefs.md)               | System time format & animation-speed prefs | Android, iOS, Desktop  |
| [predictive-back](predictive-back.md) | Android predictive-back gesture bridge     | Android                |
| [wear-sync](wear-sync.md)             | Wear OS Data Layer synchronisation         | Android (Wear OS)      |

## Authoring Patterns

| Document                                                        | Purpose                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [plugin-manifest-quickstart](plugin-manifest-quickstart.md)     | Quick start template for manifest injection                                        |
| [plugin-manifest-pattern](plugin-manifest-pattern.md)           | Full reference for the injection pattern                                           |
| [plugin-manifest-pr-checklist](plugin-manifest-pr-checklist.md) | PR review checklist for plugin changes                                             |
| [command-conventions](command-conventions.md)                   | `COMMANDS` scope (webview-invokable only) and Kotlin `@Command` naming (camelCase) |

## Reference Implementation

See `plugins/alarm-manager/build.rs` for a complete working example of the manifest injection pattern.
