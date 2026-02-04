# Threshold

**About, not at.** Threshold is a minimalist alarm clock for Android and Desktop that replaces rigid, to-the-minute alarms with flexible time windows. Its core feature — Random Window mode — lets you define a range (e.g., 7:00–7:30 AM) and picks a random moment within it to ring. Built on a philosophy of calm computing: local-first, privacy-respecting, and designed to support natural transitions rather than demand constant precision.

## Architecture

This is a **monorepo** managed by `pnpm workspaces`.

- `apps/threshold`: The main Tauri v2 application.
- `apps/site`: Static landing page deployed to GitHub Pages.
- `packages/core`: Shared TypeScript logic (Scheduler, Recurrence rules).
- `plugins/alarm-manager`: Custom Tauri plugin for native Android AlarmManager integration.
- `plugins/app-management`: Custom Tauri plugin for mobile app lifecycle (e.g., minimize on Android).
- `plugins/theme-utils`: Custom Tauri plugin for Material You / system theme integration.
- `plugins/time-prefs`: Custom Tauri plugin for time preference handling.

## Tech Stack

- **Framework:** [Tauri v2](https://v2.tauri.app/) (Rust backend, web frontend, native mobile support)
- **Frontend:** React 19 + TypeScript + MUI (Material UI)
- **Routing:** TanStack Router
- **Persistence:** SQLite via `tauri-plugin-sql`
- **Mobile Native:** Kotlin (via custom Tauri plugins)
- **Build:** Vite + pnpm workspaces

## Features

- **Random Window Alarms** — define a time range; Threshold picks a random moment within it
- **Fixed Alarms** — traditional alarms at a specific time
- **Recurrence** — schedule alarms for specific days of the week
- **Custom Alarm Sounds** — choose your own sound files
- **Snooze** — configurable snooze duration with notification countdown
- **Privacy** — all data stays on-device, no accounts, no analytics

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Rust (Stable)
- Android Studio & SDK (for mobile build)
- Linux dependencies (see `.devcontainer/Dockerfile` or Tauri docs)

### Setup

```bash
pnpm install
```

### Running

#### Desktop Dev

You can run the desktop development server from the root:

```bash
pnpm dev:desktop
```

#### Android Dev

You can run the android development server from the root:

```bash
pnpm dev:android
```

## Testing

Run all tests (TypeScript via Vitest, Rust via cargo nextest) from the root:

```bash
pnpm test
```

## Formatting

Format the codebase with Prettier:

```bash
pnpm format
```

## Debugging

To capture logs from the Android device, use the following `adb` command. This filters specifically for the app's tags and saves the output to a file:

```bash
adb logcat -s threshold:* AlarmManagerPlugin:* AlarmReceiver:* AlarmRingingService:* BootReceiver:* SetAlarmActivity:* TimePrefsPlugin:* ThemeUtils:* DatabaseService:* chromium:I Tauri/Console:* *:E > logcat.log
```

## Documentation

- [Specification](SPEC.md)
- [Agent Guidelines](AGENTS.md)
- [UI Task Description](docs/UI_TASK.md)
- [Alarm Manager](docs/ALARM_MANAGER.md)
- [App Management](docs/APP_MANAGEMENT.md)
- [Time Preferences](docs/TIME_PREFS.md)
- [Desktop Deep Links](docs/DESKTOP_DEEPLINKS.md)
