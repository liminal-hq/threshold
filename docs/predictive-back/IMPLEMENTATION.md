# Android Predictive Back Implementation

This document outlines the implementation of Android's predictive back gesture ("peek") for the Window Alarm app.

## Overview

The implementation bridges Android's `OnBackAnimationCallback` (API 34+) to the webview, allowing the React frontend to render a real-time scrubbable animation.

## Architecture

```mermaid
sequenceDiagram
    participant User
    participant Android as Android System (API 34+)
    participant Plugin as Tauri Plugin (Kotlin/Rust)
    participant Controller as Frontend Controller
    participant UI as RouteStage (React)

    User->>Android: Swipes Back (Start)
    Android->>Plugin: onBackStarted
    Plugin->>Controller: emit 'started'
    Controller->>UI: update state (active=true)
    UI->>UI: Mount Underlay (Tier 2A)

    loop Dragging
        User->>Android: Drag Progress
        Android->>Plugin: onBackProgressed
        Plugin->>Controller: emit 'progress' (0..1)
        Controller->>UI: update progress
        UI->>UI: Translate Top / Scale Underlay
    end

    alt Cancel
        User->>Android: Releases (Cancel)
        Android->>Plugin: onBackCancelled
        Plugin->>Controller: emit 'cancelled'
        Controller->>UI: update state (active=false)
        UI->>UI: Animate Snap Back
    else Commit
        User->>Android: Releases (Invoke)
        Android->>Plugin: onBackInvoked
        Plugin->>Controller: emit 'invoked'
        Controller->>UI: update state (progress=1)
        UI->>UI: router.history.back()
    end
```

### 1. Native Plugin (`plugins/predictive-back`)

- **Location**: `plugins/predictive-back` (Rust), `plugins/predictive-back/android` (Kotlin).
- **Responsibilities**:
  - Registers `OnBackAnimationCallback` on Android 14+ (API 34+).
  - Emits events: `started`, `progress`, `cancelled`, `invoked`.
  - Exposes `setCanGoBack(boolean)` to enable/disable the callback interception.

### 2. Frontend Controller (`PredictiveBackController.ts`)

- **Location**: `apps/window-alarm/src/utils/PredictiveBackController.ts`.
- **Responsibilities**:
  - Listens to plugin events.
  - Manages state: `{ active, progress, edge }`.
  - Exposes imperative methods for the UI to subscribe.

### 3. UI Component (`RouteStage.tsx`)

- **Location**: `apps/window-alarm/src/components/RouteStage.tsx`.
- **Responsibilities**:
  - Wraps the `<Outlet />` in the Router.
  - Renders the "Top" layer (current page) and "Underlay" layer (previous page).
  - Applies CSS transforms based on gesture progress.
  - **Tier 2A**: Uses `RouteRegistry` to render the *actual* previous screen component in the underlay.

### 4. Router Integration

- **Location**: `apps/window-alarm/src/router.tsx`.
- The `RootLayout` uses `RouteStage` instead of a plain div.

## Behaviour

- **Android 14+**: Swipe back triggers the "peek" animation. If committed, navigates back. If cancelled, snaps back.
- **Android < 14**: Standard discrete back button behaviour (no swipe).
- **Ringing Screen**: Predictive back is disabled to prevent accidental dismissal.

## Events

The plugin emits the following events (channel: `predictive-back://<event>`):

- `started`: Gesture began. Data: `{ progress: 0, edge: 'left'|'right' }`
- `progress`: Gesture updated. Data: `{ progress: 0..1, edge: 'left'|'right' }`
- `cancelled`: Gesture abandoned.
- `invoked`: Gesture completed (commit).

## Development

- To test on Desktop: The plugin is mocked to no-op.
- To test on Android: Requires an Android 14+ emulator or device.
