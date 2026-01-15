# UI Implementation Task: Window Alarm

## Overview
The goal is to build a minimalist, mobile-first UI using **React** and **Ionic Framework** that matches the provided prototypes and functional requirements. The design should be clean and accessible.

## Global Theme
- **Framework:** Ionic React (`@ionic/react`).
- **Styling:** Ionic Utility Classes + Custom CSS variables.
- **Font:** System default (Roboto/San Francisco).
- **Colour Palette:**
  - Primary: Deep Night Blue (or System default).
  - Accent: Vibrant Orange (for action buttons/FABs).
  - Background: System Light/Dark mode compatible.

## Navigation Structure
- **Single Activity App:** No bottom tabs.
- **Router:** `IonReactRouter`.
- **Routes:**
  - `/home` (Main List)
  - `/edit/:id` (Create/Edit Alarm)
  - `/ringing/:id` (Alarm Active Screen)

---

## Screens & Components

### 1. Home Screen (`/home`)
**Purpose:** Display the list of alarms and next scheduled event.

**Layout:**
- **Header:** Title "Window Alarm".
- **Content:** List of alarm cards.
- **Footer/FAB:** Floating Action Button (+) to add a new alarm.

**Components:**
- `AlarmList`: A virtualized list or simple map of `AlarmItem` components.
- `AlarmItem`:
  - **Left:** Time Display (Large text).
    - If Fixed: Show Time (e.g., "07:30").
    - If Window: Show Range (e.g., "07:00 - 07:30").
  - **Subtitle:** Label + Next trigger preview (e.g., "Meditation • Tomorrow at 7:12 AM").
  - **Right:** `IonToggle` (Enable/Disable).
  - **Interaction:** Tap to Edit, Slide to Delete (`IonItemSliding`, `IonItemOptions`).
- `AddButton`: `IonFab` positioned bottom-end.

---

### 2. Edit Alarm Screen (`/edit/:id`)
**Purpose:** Create or modify an alarm configuration.

**Layout:**
- **Header:**
  - Left: "Cancel" button.
  - Title: "Edit Alarm" / "New Alarm".
  - Right: "Save" button (Strong accent colour).
- **Content:** Form inputs.

**Components:**
- `ModeSelector`: `IonSegment` (Fixed | Random Window).
- `TimeInput`:
  - **Fixed Mode:** `IonDatetime` (Presentation: time).
  - **Window Mode:** Two `IonDatetime` inputs (Start Time, End Time).
- `DaySelector`: A row of toggleable circular buttons (Mon, Tue, Wed...).
  - Component: `DayToggleGroup` -> `DayToggle` (Active state fills colour).
- `LabelInput`: `IonInput` (Placeholder: "Label (Optional)").
- `DeleteButton`: (Only if editing) Red outline button at the bottom.

**Validation Logic:**
- Window Mode: Start Time must be distinct from End Time.
- Days: At least one day must be selected.

---

### 3. Ringing Screen (`/ringing/:id`)
**Purpose:** The "Wake Up" screen. This must override the lock screen (handled by native activity, but UI is here).

**Layout:**
- **Full Screen:** Immersive mode.
- **Visuals:** High contrast, large text.
- **Animation:** Gentle pulsing background or icon to indicate ringing.

**Components:**
- `CurrentTime`: Massive digital clock display.
- `Label`: "Wake Up!" or user label.
- `SnoozeButton`: Large secondary button ("Snooze 10m").
- `DismissButton`: Slide-to-unlock style or Long-Press button to prevent accidental dismissals.
  - *Recommendation:* `IonRange` slider "Slide to Stop" or a Long Press button component.

---

## State Management & Logic
- **Hooks:**
  - `useAlarms()`: Subscribes to SQLite changes.
  - `useNextTrigger(alarm)`: Calculates the specific next time for UI display.
- **Services:**
  - `AlarmService`: Facade for SQLite + Native Plugin calls.

## Asset Requirements
- **Icons:** Ionicons (Standard library).
  - `add`, `alarm`, `trash`, `create`, `close`, `checkmark`.
