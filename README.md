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

## Android logging

```bash
adb logcat -s threshold:* AlarmManager:* AlarmManagerPlugin:* AlarmReceiver:* AlarmRingingService:* BootReceiver:* SetAlarmActivity:* AlarmService:* ThemeUtils:* TimePrefsPlugin:* chromium:I Tauri/Console:* *:E > logcat.log
```

## Documentation

- [Docs index](docs/README.md)
- [Specification](SPEC.md)
- [Agent guidelines](AGENTS.md)
