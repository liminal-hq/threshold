# Window Alarm Monorepo

Welcome to the Window Alarm project! This is a minimalist alarm clock application designed for Android and Desktop (Tauri).

## Architecture

This is a **monorepo** managed by `pnpm workspaces`.

- `apps/window-alarm`: The main Tauri v2 application (React + Ionic).
- `packages/core`: Shared Typescript logic (Scheduler, Recurrence rules).
- `plugins/alarm-manager`: Custom Tauri Plugin for native Android AlarmManager integration.
- `plugins/alarm-manager/android`: The native Android library code.

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

## Documentation

- [UI Task Description](docs/UI_TASK.md)
- [Agent Guidelines](AGENTS.md)
- [Specification](SPEC.md)
