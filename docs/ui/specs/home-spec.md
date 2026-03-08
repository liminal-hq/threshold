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
- mobile toolbar with title + refresh + overflow
- desktop in-screen fixed Settings icon

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

- tapping/clicking alarm row navigates to `/edit/$id`
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
- error: delete/save errors logged to console, no inline error UI

## Theme Contract

- uses MUI palette roles (`background.paper`, `divider`, `text.secondary`)
- does not require hardcoded colour constants
- Material You can affect active theme on Android through shared theme system
- desktop does not perform Material You extraction

## Accessibility Contract

- switch controls are accessible via MUI switch semantics
- mobile add action uses large FAB touch target
- reduced motion should follow existing transition and gesture behaviour controls

## Local Exceptions

- desktop Settings action is separate from bottom add action in current code

## Open Questions

1. introduce explicit empty state on Home in the first redesign implementation pass?
