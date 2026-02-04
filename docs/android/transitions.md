# Android Navigation Transitions

This document outlines the implementation of native-like page transitions for the Android version of Threshold (Window Alarm).

## Overview

We use the View Transitions API (progressive enhancement) coupled with TanStack Router to provide smooth push/pop transitions on Android.

## Implementation Details

### 1. Feature Detection
We detect if the app is running on Android and if `document.startViewTransition` is available. If not, transitions are disabled.

See: `apps/window-alarm/src/utils/RouteTransitions.ts`

### 2. Direction Management
We maintain a simple in-memory stack of visited paths to determine if a user is navigating "forwards" (push) or "backwards" (pop).
- **Push:** Navigating to a new route.
- **Pop:** Navigating to the previous route in the stack.

The hardware back button explicitly sets the next transition direction to "backwards".

### 3. CSS Animations
We use standard CSS `@keyframes` and the `::view-transition-*` pseudo-elements.
- **`wa-route-slot`**: The `view-transition-name` assigned to the main route outlet.
- **`wa-slide-in-from-right` / `wa-slide-out-to-left`**: Used for forward transitions.
- **`wa-slide-in-from-left` / `wa-slide-out-to-right`**: Used for backward transitions.

See: `apps/window-alarm/src/theme/transitions.css`

### 4. Router Configuration
We configure `defaultViewTransition` in TanStack Router to enable transitions and apply the correct `types` (`wa-slide`, `wa-forwards`/`wa-backwards`) based on the calculated direction.

See: `apps/window-alarm/src/router.tsx`

## Special Cases

- **Ringing Screen:** Transitions are disabled for `/ringing/:id` to ensure the alarm screen appears immediately without animation delays.
- **Reduced Motion:** We respect `prefers-reduced-motion` media queries to disable animations for users who request it.

## Testing

To verify transitions:
1. Run on an Android device or emulator (API 34+ recommended for View Transition support, though it works on recent WebView versions).
2. Navigate between Home, Settings, and Edit screens.
3. Verify that "Back" actions slide content to the right, and forward actions slide content to the left.
