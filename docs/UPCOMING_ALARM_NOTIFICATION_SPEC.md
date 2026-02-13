# Upcoming Alarm Notification Spec

## Goal

Notify the user within 10 minutes of the next scheduled alarm and allow them to dismiss that alarm directly from the notification.

## User-Facing Behaviour

- The app sends a local notification 10 minutes before an alarm is due.
- Notification title for fixed alarms is: `Upcoming alarm`
- Notification title for random window alarms includes the window range, for example:
  - `Upcoming alarm (window 7:00 AM-8:00 AM)`
- Notification body shows the time of the next alarm (respecting user 12h/24h preference).
- Notification includes action buttons:
  - `Dismiss alarm`
  - `Snooze`

## Action Behaviour

- When the user taps `Dismiss alarm`:
  - Dismiss only the next occurrence (do not disable the alarm).
  - Cancel the current native scheduled trigger for that occurrence.
  - Immediately calculate and schedule the next normal occurrence.
  - The alarm list updates across windows/views.

## Scope

- In scope:
  - Mobile-first implementation (`android` and `ios`) using notification actions.
  - Upcoming notification actions: dismiss + snooze.
- Out of scope:
  - Repeating reminder notifications.
  - Desktop-specific notification action parity (desktop notification actions are not supported in this flow).

## Phase 1: Snooze Upcoming Alarm

- Snooze behaviour:
  - Snooze only the next occurrence.
  - Shift the targeted alarm `nextTrigger` forward by configured snooze minutes.
  - Reschedule native alarm trigger to the new time.
  - Update alarm persistence and UI state.
- Show immediate confirmation toast in app UI:
  - `Alarm snoozed for X min and will go off at XX:XX AM`
  - Use user 12h/24h format rules for time rendering.
- If app is backgrounded, use native out-of-app toast where supported.
- Do not send an extra notification for snooze confirmation.

## Proposed Technical Design

1. Register a new notification action type in `AlarmManagerService.init()`:
   - Action type ID: `upcoming_alarm`
   - Action ID: `dismiss_alarm`
   - Action ID: `snooze_alarm`
2. Send an upcoming notification when an alarm is scheduled/rescheduled:
   - Compute `notifyAt = nextTrigger - 10 minutes`.
   - Only schedule/send if `notifyAt > now`.
   - Include the alarm ID in notification payload/id so the action can target the correct alarm.
3. Handle `onAction` callback for `upcoming_alarm` + `dismiss_alarm`:
   - Load the alarm by ID.
   - Cancel native alarm for the current occurrence.
   - Recalculate/schedule the next normal occurrence while keeping alarm enabled.
   - Persist and emit global alarm change event.
4. Handle `onAction` callback for `upcoming_alarm` + `snooze_alarm`:
   - Load the alarm by ID.
   - Shift `nextTrigger` by configured snooze duration.
   - Reschedule native alarm and persist.
   - Show toast confirmation with snooze duration and new trigger time.

## Timing and Edge Cases

- If an alarm is created less than 10 minutes before it rings:
  - Send the upcoming notification immediately.
- If alarm time changes:
  - Cancel/replace any previously planned upcoming notification for that alarm.
- If alarm is deleted or disabled before `notifyAt`:
  - Ensure upcoming notification is not shown.
- If notification permission is denied:
  - Alarm scheduling still works; only the upcoming notification is skipped.

## Random Window Alarm Behaviour

- For `RandomWindow` alarms, use the resolved `nextTrigger` timestamp (already calculated by scheduler logic), not `windowStart`/`windowEnd`, when deciding whether to notify.
- Show random-window context in the notification title by including the configured window range.
- The notification body should show the resolved trigger time only, not the full window range.
- If `nextTrigger` is less than 10 minutes away at scheduling time, send the upcoming notification immediately.
- If the alarm is recalculated to a new random trigger, the upcoming notification should be recalculated as well.

## Data and Formatting

- Time shown in body should use the app’s time format preference from settings.
- Proposed body format:
  - `Next alarm "Gym" at 07:30`
  - or `Next alarm "Gym" at 7:30 AM` depending on preference.
- Title formatting:
  - Fixed: `Upcoming alarm`
  - Random window: `Upcoming alarm (window HH:MM-HH:MM)` in user 12h/24h format.

## Acceptance Criteria

- A scheduled alarm more than 10 minutes in the future triggers one upcoming notification at T-10 minutes.
- Notification content matches:
  - Title: `Upcoming alarm`
  - Body: alarm label + next alarm time
  - Actions: `Dismiss alarm`, `Snooze`
- Tapping `Dismiss alarm` skips only the current occurrence and the alarm still rings on the next scheduled day/window.
- Tapping `Snooze` delays only the next occurrence by configured snooze minutes and shows confirmation toast.
- Alarm state remains enabled and persists correctly after app restart.

## Finalised Decisions

- `Dismiss alarm` dismisses only the next occurrence; the alarm remains enabled for future occurrences.
- Notification body includes the alarm label plus the next alarm time.
- `Snooze` applies only to the next occurrence.

## Extra Spec: Tauri Toast Plugin (Build Here First)

### Objective

Create a new Threshold-owned Tauri plugin to show native toast messages for alarm actions, including when the app is not in the foreground.

### Product Rule for Snooze Confirmation

- Do not send an additional notification for snooze confirmation.
- Show toast confirmation only:
  - In-app toast when app is open/in foreground.
  - Native out-of-app toast when app is backgrounded or not open (where supported).
- Confirmation copy:
  - `Alarm snoozed for X min and will go off at XX:XX AM`
  - Use 24h format when that preference is enabled.

### Plugin Name and Location

- Proposed plugin package: `tauri-plugin-toast`
- Proposed repo location (this monorepo first):
  - `plugins/toast/`

### Initial API (Draft)

- JavaScript/TypeScript API:
  - `showToast(options)`
- `options`:
  - `message: string` (required)
  - `duration?: 'short' | 'long'` (default `short`)
  - `position?: 'bottom' | 'centre' | 'top'` (best effort per platform)

### Platform Behaviour (Draft)

- Android:
  - Use native Android `Toast`.
  - Works while app process is alive; if process is dead, no toast guarantee.
- iOS:
  - No true system-wide toast equivalent for background/dead app without notifications.
  - Plugin can provide in-app overlay only on iOS.
- Desktop:
  - Optional in-app toast bridge only (no OS toast requirement).

### Integration with Upcoming Alarm Feature

- When user taps `Snooze` action:
  - Alarm reschedules using snooze interval.
  - Call toast plugin with formatted confirmation message.
- If platform cannot show out-of-app toast:
  - No extra notification fallback (explicit requirement).
  - Best-effort in-app toast only when app is active.

### Engineering Plan (Plugin-First)

1. Scaffold `plugins/toast` with Tauri v2 plugin structure.
2. Add Android implementation for native `Toast.makeText(...)`.
3. Wire command in Rust plugin layer and expose TS guest bindings.
4. Add capability permission (e.g., `toast:default`) and permission schema files.
5. Register plugin in `apps/threshold/src-tauri/src/lib.rs`.
6. Add a simple Settings test action to trigger a toast manually.
7. Integrate toast call into snooze action flow.

### Android Manifest and Permissions

- Follow Threshold plugin manifest injection pattern.
- If no additional Android permissions are required for `Toast`, keep manifest injection minimal/empty but still follow documented plugin pattern conventions.

### Acceptance Criteria (Plugin)

- From app UI, calling `showToast({ message })` shows a native toast on Android.
- Snooze action triggers toast confirmation text with correct computed time.
- No additional notification is sent for snooze confirmation.
- Feature degrades gracefully on unsupported platforms without crashing.
