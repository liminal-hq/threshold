# Predictive Back Plugin (`predictive-back`)

**Plugin location:** `plugins/predictive-back/`
**Status:** Active
**Platforms:** Android (native), iOS/Desktop (stub -- no-op)

> This document is a quick reference. For the full architecture -- native → Rust → JS event flow, the `RouteStage`/`ScreenStack` frontend design, and how this coordinates with the app's existing discrete View Transition system -- see [docs/predictive-back/IMPLEMENTATION.md](../predictive-back/IMPLEMENTATION.md).

## Overview

Bridges Android's `OnBackAnimationCallback` (API 33+) to the webview, so `RouteStage.tsx` can render a real-time, scrubbable "peek" of the previous screen during a swipe-back gesture, instead of a discrete back-button press.

## API Reference

### `set_can_go_back`

Tells native whether there's anywhere in-app for a back gesture to go. `true` registers the callback and starts gesture frames flowing; `false` unregisters it, letting the system fall through to its own default behaviour (app-minimize / cross-task animation).

```ts
import { setCanGoBack } from 'tauri-plugin-predictive-back-api';

await setCanGoBack(true);
```

### `predictive-back:event`

A Tauri event (not a command) carrying each gesture frame: `{ type: 'started' | 'progress' | 'cancelled' | 'invoked', progress: number }`.

```ts
import { listen } from '@tauri-apps/api/event';
import { PREDICTIVE_BACK_EVENT, type PredictiveBackEvent } from 'tauri-plugin-predictive-back-api';

await listen<PredictiveBackEvent>(PREDICTIVE_BACK_EVENT, (event) => {
	console.log(event.payload.type, event.payload.progress);
});
```

## Implementation Details

### Android

- **Class:** `com.plugin.predictiveback.PredictiveBackPlugin`
- Registers `OnBackAnimationCallback` via `activity.onBackInvokedDispatcher` on API 33 (Tiramisu) and above -- that's when the callback and `BackEvent` classes actually shipped.
- A `Channel`, registered once from Rust at plugin init, carries gesture frames to Rust, which re-emits them as the `predictive-back:event` Tauri event. No SharedPreferences replay queue is needed (unlike `alarm-manager`'s channels) -- a back gesture can only happen while the Activity, and this channel, are already live.
- `onResume()` forces a clean re-registration, since the system's dispatcher registration doesn't reliably survive a pause/resume cycle (e.g. screen off then back on) even though the Kotlin `callback` object reference does.
- **Permissions:** None required.

### iOS / Desktop

- **Status:** Stub. `set_can_go_back` is a no-op; no gesture events are ever emitted.

## Architecture Guidelines

- **Manifest Injection:** This plugin owns its (currently empty) permission block via `build.rs`, but `android:enableOnBackInvokedCallback="true"` -- required on `<application>` for any of this to activate -- can't be injected by a plugin at all (it's an attribute on an already-open tag, which `update_android_manifest()` has no path to). See `apps/threshold/src-tauri/build.rs`, which patches it in directly and idempotently on every Android build instead.
- **Gradle:** Registered via `.android_path("android")` in `build.rs`.
