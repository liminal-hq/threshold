# Edit/New Alarm Screen Spec

## Metadata

- Status: baseline
- Last Updated: 2026-03-08
- Route: `/edit/$id`
- Primary Source Files:
  - `apps/threshold/src/screens/EditAlarm.tsx`
  - `apps/threshold/src/components/DaySelector.tsx`
  - `apps/threshold/src/components/TimePicker/TimePicker.tsx`

## Purpose

- create or edit a single alarm configuration, then save it back to the alarm service

## Platform Behaviour

### Mobile

- uses `MobileToolbar` with close action and save action
- uses MUI `TimePicker` controls
- uses tap row for sound picker file flow

### Desktop

- uses in-content heading (`New Alarm` or `Edit Alarm`)
- uses custom desktop time picker component
- uses select menu for sound selection
- uses fixed bottom footer with `Cancel` and `Save Alarm` actions

## Layout Anatomy

1. header zone
- mobile toolbar or desktop title block

2. form content zone
- mode selector (`Fixed Time` / `Window`)
- time inputs
- label input
- repeat day selector
- sound control

3. fixed action zone (desktop only)
- cancel/save buttons fixed to bottom edge

## Content Contract

- mode defaults to `Fixed`
- days default to every day on new alarm
- default time is next hour at `:00`
- label placeholder: `Alarm Label (e.g. Wake Up)`
- sound fallback label: `System Default`

## Interaction Contract

- `id === new` creates; otherwise loads existing alarm and edits
- save action validates at least one active day
- save action always persists with `enabled: true`
- mobile close and desktop cancel both return to `/home`
- on save success, navigate to `/home`

## State Matrix

- loading existing alarm: async fetch with silent fail to console
- validation error: alert for missing repeat day
- save error: alert shown + console error
- populated edit: pre-filled values from `AlarmService.get`
- new mode: defaults pre-filled from current time

## Theme Contract

- uses MUI controls and palette defaults
- no desktop-specific Material You behaviour
- Android can still inherit Material You colours through global theme when enabled

## Accessibility Contract

- form controls use standard MUI semantics
- desktop footer actions are persistent and keyboard reachable
- mobile header save action is always visible

## Local Exceptions

- no explicit validation that window start and end are different in current screen logic

## Open Questions

1. should window-mode start/end distinct validation be added in redesign phase 1?
2. should save button be disabled until form is valid, instead of alert-based feedback?
