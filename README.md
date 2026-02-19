# Threshold

**About, not at.** Threshold is a minimalist alarm clock for Android and Desktop that replaces rigid, to-the-minute alarms with flexible time windows. Its core feature, Random Window mode, lets you define a range (for example, 07:00-07:30) and rings at a random moment within it.

## Architecture

This repository is a `pnpm` workspace monorepo.

- `apps/threshold`: Main Tauri v2 application (React + MUI)
- `apps/site`: Static landing page
- `packages/core`: Shared TypeScript scheduler/types
- `plugins/alarm-manager`: Native alarm scheduling bridge
- `plugins/app-management`: Mobile lifecycle/app-management helpers
- `plugins/theme-utils`: System theme and Material You utilities
- `plugins/time-prefs`: 12/24-hour time preference bridge
- `plugins/wear-sync`: Wear OS sync integration plugin
- `plugins/toast`: Android toast bridge plugin

## Getting started

### Prerequisites

- Node.js 20+
- `pnpm`
- Rust (stable)
- Android Studio + SDK (for mobile builds)

### Setup

```bash
pnpm install
```

### Run

```bash
pnpm dev:desktop
pnpm dev:android
```

## Testing

```bash
pnpm test
```

## Formatting

```bash
pnpm format
```

## Release Versioning

Use the interactive release TUI to update phone and Wear versions in one flow:

```bash
pnpm version:release
```

What it updates:

- `apps/threshold/src-tauri/tauri.conf.json` (`version`)
- `apps/threshold-wear/build.gradle.kts` (`versionName` + `versionCode`)
- Optional: `apps/threshold/package.json` (`version`)

TUI shortcuts:

- `h` or `?` for help
- `q` to quit
- Version step: `1/p` patch, `2/m` minor, `3/M` major, `4/c` custom
- Version step: `←/→` (or mouse wheel) to cycle bump options, `Enter`/left click/middle click to confirm
- Review step: `a` apply, `b` back/restart
- Review step: right click (or mouse back button) maps to back when available

TUI behaviour:

- Uses an alternate screen buffer and restores the terminal on exit
- Handles terminal resize events and redraws to the new dimensions
- Ignores non-action escape sequences (for example, unsupported mouse events)

## Android logging

```bash
adb logcat -s threshold:* AlarmManager:* AlarmManagerPlugin:* AlarmReceiver:* AlarmRingingService:* BootReceiver:* SetAlarmActivity:* AlarmService:* ThemeUtils:* TimePrefsPlugin:* chromium:I Tauri/Console:* *:E > logcat.log
```

## Documentation

- [Docs index](docs/README.md)
- [Specification](SPEC.md)
- [Agent guidelines](AGENTS.md)
