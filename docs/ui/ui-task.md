# UI Implementation Task: Threshold

## Overview

The goal is to build a minimalist, mobile-first UI using **React** and **Material-UI (MUI)** that matches the provided prototypes and functional requirements. The design should be clean and accessible.

## Global Theme

- **Framework:** MUI (`@mui/material` v7).
- **Styling:** Emotion CSS-in-JS (`sx` prop, `styled()`) + Custom MUI theme.
- **Theming:** Material You integration on Android (dynamic colour from wallpaper). Multiple named themes (`deep-night`, `canadian-cottage-winter`, `georgian-bay-plunge`, `boring-light`, `boring-dark`, `system`).
- **Font:** System default (Roboto/San Francisco).
- **Colour Palette:**
  - Primary: Deep Night Blue (or System default / Material You dynamic).
  - Accent: Vibrant Orange (for action buttons/FABs).
  - Background: System Light/Dark mode compatible.

## Navigation Structure

- **Single Activity App:** No bottom tabs.
- **Router:** TanStack Router (`@tanstack/react-router`).
- **Routes:**
  - `/home` (Main List)
  - `/edit/:id` (Create/Edit Alarm)
  - `/ringing/:id` (Alarm Active Screen)

---

## Screens & Components

### 1. Home Screen (`/home`)

**Purpose:** Display the list of alarms and next scheduled event.

**Layout:**

- **Header:** Title "Threshold".
- **Content:** List of alarm cards.
- **Footer/FAB:** Floating Action Button (+) to add a new alarm.

**Components:**

- `AlarmList`: A `List` or simple map of `AlarmItem` components.
- `AlarmItem`:
  - **Left:** Time Display (Large `Typography`).
    - If Fixed: Show Time (e.g., "07:30").
    - If Window: Show Range (e.g., "07:00 - 07:30").
  - **Subtitle:** Label + Next trigger preview (e.g., "Meditation - Tomorrow at 7:12 AM").
  - **Right:** `Switch` (Enable/Disable).
  - **Interaction:** Tap to Edit, Swipe to Delete (custom `motion/react` component — see [swipe-to-delete-row](swipe-to-delete-row.md)).
- `AddButton`: `Fab` from `@mui/material` positioned bottom-end.

---

### 2. Edit Alarm Screen (`/edit/:id`)

**Purpose:** Create or modify an alarm configuration.

**Layout:**

- **Header:**
  - Left: "Cancel" button (`IconButton` with `Close` icon).
  - Title: "Edit Alarm" / "New Alarm".
  - Right: "Save" button (`Button` with accent colour).
- **Content:** Form inputs.

**Components:**

- `ModeSelector`: `ToggleButtonGroup` (Fixed | Random Window).
- `TimeInput`:
  - **Fixed Mode:** `TimePicker` from `@mui/x-date-pickers`.
  - **Window Mode:** Two `TimePicker` inputs (Start Time, End Time).
- `DaySelector`: A row of toggleable circular `ToggleButton` components (Mon, Tue, Wed...).
  - Component: `DayToggleGroup` -> `DayToggle` (Active state fills colour).
- `LabelInput`: `TextField` (Placeholder: "Label (Optional)").
- `DeleteButton`: (Only if editing) Red outline `Button` at the bottom.

**Validation Logic:**

- Window Mode: Start Time must be distinct from End Time.
- Days: At least one day must be selected.

---

### 3. Ringing Screen (`/ringing/:id`)

**Purpose:** The "Wake Up" screen. This must override the lock screen (handled by native activity, but UI is here).

**Layout:**

- **Full Screen:** Immersive mode.
- **Visuals:** High contrast, large text.
- **Animation:** Gentle pulsing background or icon to indicate ringing (using `motion/react`).

**Components:**

- `CurrentTime`: Massive digital clock display (`Typography` variant).
- `Label`: "Wake Up!" or user label.
- `SnoozeButton`: Large secondary `Button` ("Snooze 10m").
- `DismissButton`: Slide-to-unlock style or Long-Press button to prevent accidental dismissals.
  - _Recommendation:_ Custom `Slider` "Slide to Stop" or a Long Press button component.

---

## State Management & Logic

- **Hooks:**
  - `useAlarms()`: Subscribes to SQLite changes.
  - `useNextTrigger(alarm)`: Calculates the specific next time for UI display.
- **Services:**
  - `AlarmService`: Facade for SQLite + Native Plugin calls.

## Asset Requirements

- **Icons:** `@mui/icons-material`.
  - `Add`, `Alarm`, `Delete`, `Edit`, `Close`, `Check`.
