# Home Screen Spec

## Metadata

- Status: baseline
- Last Updated: 2026-03-08
- Route: `/home`
- Primary Source Files:
  - `apps/threshold/src/screens/Home.tsx`
  - `apps/threshold/src/components/AlarmItem.tsx`
  - `apps/threshold/src/components/SwipeToDeleteRow.tsx`

## Purpose

- show the alarm list and provide the fastest path to add, edit, toggle, and delete alarms

## Platform Concept Model

### Shared Concepts

- `HOME-C1`: Alarm Collection - a scrollable list of alarm rows sourced from `useAlarms()`
- `HOME-C2`: Alarm Row - time, label, and status with trailing controls
- `HOME-C3`: Primary Create Action - direct path to create a new alarm
- `HOME-C4`: Settings Access - direct path to `/settings`

### Mobile Concepts

- `HOME-M1`: Compact App Header - top `MobileToolbar` with title, refresh, and overflow actions
- `HOME-M2`: Gesture Row Interaction - swipe-to-delete row wrapper with spring return
- `HOME-M3`: Floating Primary Action - bottom-right FAB for add

### Desktop Concepts

- `HOME-D1`: Window Shell Continuity - custom title bar in route shell
- `HOME-D2`: Wide-List Presentation - alarm rows rendered in MUI `List` with desktop spacing
- `HOME-D3`: Bottom Action Zone - fixed footer add button style as implemented in code
- `HOME-D4`: Secondary Settings Control - currently top-right fixed gear; planned move beside bottom add action

## Platform Mapping Matrix

| Concept ID | Mobile Expression | Desktop Expression |
|---|---|---|
| `HOME-C1` | mapped alarm rows in content container | mapped alarm rows inside MUI `List` |
| `HOME-C2` | row tap + swipe wrapper + switch | row click + delete icon + switch |
| `HOME-C3` | floating FAB at bottom-right | fixed footer contained button |
| `HOME-C4` | overflow menu item in toolbar | fixed icon button (current), bottom-zone gear (planned) |

## Platform Behaviour

### Mobile

- uses `MobileToolbar` with app title
- shows refresh icon in toolbar end action
- exposes Settings via overflow menu
- renders alarm items in a direct mapped list (not MUI `List` wrapper)
- uses bottom-right fixed FAB for add action

### Desktop

- uses custom app title bar from route shell (`TitleBar`)
- shows Settings gear as fixed top-right icon button
- renders alarms inside MUI `List`
- uses fixed bottom action bar with centred `Add Alarm` contained button

## Layout Anatomy

1. header zone
- mobile toolbar with title, refresh, and overflow
- desktop in-screen fixed Settings icon (current baseline)

2. content zone
- full-height scroll container
- alarm rows from `useAlarms()` context

3. fixed action zone
- mobile floating FAB
- desktop full-width footer with primary add button

## Content Contract

- `AlarmItem` time line:
  - fixed mode: formatted fixed time
  - window mode: formatted `start - end`
- label line: alarm label with fallback `Alarm`
- status line:
  - enabled + next trigger: `EEE` + formatted trigger time
  - otherwise: `Disabled`

## Interaction Contract

- tapping or clicking alarm row navigates to `/edit/$id`
- toggling switch calls `AlarmService.toggle`
- deleting calls `AlarmService.delete`
- add action navigates to `/edit/new`
- Settings action navigates to `/settings`
- mobile swipe row supports bidirectional swipe-to-delete with spring return

## State Matrix

- loading: inherited from `useAlarms()` data lifecycle (no explicit spinner in screen)
- empty: currently no dedicated empty state component
- populated: mapped alarm items
- action in progress: no explicit per-row loading lock
- error: delete or toggle errors logged to console, no inline error UI

## Theme Contract

- uses MUI palette roles (`background.paper`, `divider`, `text.secondary`)
- does not require hardcoded colour constants
- Material You can affect active theme on Android through shared theme system
- desktop does not perform Material You extraction

## Accessibility Contract

- switch controls are accessible via MUI switch semantics
- mobile add action uses a large FAB touch target
- reduced motion follows existing transition and gesture behaviour controls

## Local Exceptions

- desktop Settings action is separate from bottom action zone in current code

## Open Questions

1. introduce explicit empty state on Home in the first redesign implementation pass?
