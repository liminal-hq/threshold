# Window Alarm — Task & Specification Document

## 1. Overview
**Window Alarm** is a minimalist alarm clock application for Android and Desktop.
**Core Feature:** It offers a "Random Window" mode where the user selects a time range (e.g., 7:00 AM - 7:30 AM), and the alarm rings *once* at a randomly selected time within that window.

## 2. Technical Architecture
The project is a **Tauri v2 Monorepo** managed with `pnpm`.

### Stack
- **Frontend:** React + TypeScript + Ionic Framework.
- **Backend (Host):** Rust (Tauri).
- **Mobile Native:** Kotlin (via Custom Tauri Plugin).
- **Persistence:** SQLite (`tauri-plugin-sql`).

### Structure (`pnpm-workspace.yaml`)
- `apps/window-alarm`: The main Tauri application.
- `packages/core`: Shared pure TypeScript logic (Recurrence rules, Random sampling).
- `plugins/alarm-manager`: Custom Tauri plugin wrapping Android's `AlarmManager`.

## 3. Requirements

### Functional Requirements
1.  **Fixed Alarm:** Standard alarm functionality (specific time).
2.  **Random Window Alarm:**
    - User picks Start Time and End Time.
    - App calculates a random trigger time for the *next* occurrence.
    - Alarm rings exactly once at that random time.
    - Reschedules automatically for the next active day after ringing.
3.  **Reliability (Android):**
    - Must use `AlarmManager.setAlarmClock` to wake from Doze mode.
    - Must survive device reboots (`BOOT_COMPLETED` receiver).
4.  **UI/UX:**
    - **Home:** List of alarms, toggle on/off, show next trigger time.
    - **Edit:** Mode switcher (Fixed/Window), Time inputs, Day repeat selection.
    - **Ringing:** Full-screen activity with Dismiss/Snooze.

### Non-Functional Requirements
- **Spelling:** All strings must use **Canadian English** (e.g., "Colour", "Centre").
- **Privacy:** Local data only. No analytics.

## 4. Development Guidelines

### Code Rules (from `AGENTS.md`)
- **No Barrel Files:** Import directly from files (e.g., `import { Foo } from './foo';` not `from './index'`).
- **UI Structure:**
    - `src/components/`: Reusable dumb components.
    - `src/screens/`: Page-level components.
    - `src/services/`: Business logic singletons.

### Data Model (`alarms` table)
- `id` (PK)
- `label` (Text)
- `mode` ('FIXED' | 'WINDOW')
- `fixed_time` (String HH:mm)
- `window_start` (String HH:mm)
- `window_end` (String HH:mm)
- `active_days` (JSON Array of ints 0-6)
- `next_trigger` (Epoch Millis, Nullable)

## 5. Implementation Strategy
1.  **Core Logic:** `packages/core` calculates the `next_trigger` timestamp.
2.  **Frontend:** React UI captures user input, uses `Core` to get the timestamp, saves to SQLite, and calls the Native Plugin.
3.  **Native Plugin:** Receives `schedule(id, timestamp)`. Sets the system alarm. onTrigger, launches the app's Ringing Screen.
