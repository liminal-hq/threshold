---
title: "Fixing Notification Action Reliability on Android"
date: "2026-02-24"
slug: "notification-action-reliability-android"
excerpt: "A bug in Tauri's Android notification plugin was silently dropping action events. What started as debugging a single dropped event across Kotlin, Rust, and JavaScript turned into an opportunity to build a more stable architecture for everyone."
tags:
  - "Threshold"
  - "Tauri"
  - "Android"
  - "Notifications"
  - "Rust"
  - "Kotlin"
  - "Open Source"
draft: false
---

When you build on an open-source framework, you eventually hit a gap that nobody has closed yet. Inheriting these gaps can be frustrating, but it also presents an amazing opportunity. Open source allows you to look under the hood, learn exactly how the systems you rely on work, and ultimately give back by fixing things once for everyone.

This is the story of one such opportunity, specific to Tauri's Android notification plugin.

Building [Threshold](https://github.com/liminal-hq/threshold), an alarm clock built with Tauri v2, required robust notification actions on Android like "Dismiss" and "Snooze". In practice, these actions were silently dropped. Trying to fix this led to diagnosing three separate issues in the upstream Tauri notification plugin. It also led to discovering an existing open PR ([`#2805`](https://github.com/tauri-apps/plugins-workspace/pull/2805)) from another developer who had surfaced the same storage bug eight months earlier. We are now collaborating to get these fixes across the finish line. Threshold needed reliable notification actions, and so does any other Tauri app trying to use them on Android.Getting there meant looking further than the app.

## How Notification Actions Work in Tauri

Tauri's [notification plugin](https://v2.tauri.app/plugin/notification/) provides a cross-platform API for sending notifications and responding to user interaction with them on mobile.

Using notification actions involves three steps. First, action types are registered with the plugin. Each type is a named set of buttons with IDs and labels:

```typescript
await registerActionTypes([
  {
    id: "alarm-actions",
    actions: [
      { id: "dismiss", title: "Dismiss" },
      { id: "snooze", title: "Snooze" },
    ],
  },
]);
```

The plugin persists these to storage on Android so it can look them up later when a button is tapped. Second, notifications are sent with an `actionTypeId` that links them to a registered set of buttons:

```typescript
await sendNotification({
  title: "Alarm",
  body: "7:00 AM",
  actionTypeId: "alarm-actions",
});
```

Third, the app registers a handler to receive action events:

```typescript
await onAction((event) => {
  if (event.actionId === "dismiss") {
    /* ... */
  }
  if (event.actionId === "snooze") {
    /* ... */
  }
});
```

When the user taps a button, the delivery chain between Android and that handler looks like this:

```
User taps "Dismiss"
  → Android BroadcastReceiver (Kotlin)
  → NotificationPlugin.dispatchActionPerformed()
  → Tauri event bridge (Rust)
  → "actionPerformed" event (JavaScript)
  → onAction handler
  → Alarm dismissed
```

Following that chain end-to-end is what turned up the three discoveries this post covers. The work described here is specific to Android; iOS has a different notification delivery path and was not in scope.

## Discovery 1: Action-Group Storage Keying

The first discovery was in `NotificationStorage.kt`, the class that persists action groups to Android `SharedPreferences`. Action groups are how the plugin tracks which actions are valid for a given notification. Without them, it can't map a tapped button back to an `actionId`.

The write loop used the action type's string ID as a key suffix:

```kotlin
fun writeActionGroup(actions: List<ActionType>) {
    for (type in actions) {
        val i = type.id                         // ← "alarm-actions", "snooze-actions", etc.
        val editor = getStorage(ACTION_TYPES_ID + type.id).edit()
        editor.putInt("count", type.actions.size)
        for (action in type.actions) {
            editor.putString("id$i", action.id)    // stored as "idalarm-actions"
            editor.putString("title$i", action.title)
        }
    }
}
```

The read path used numeric indices:

```kotlin
fun getActionGroup(id: String): List<NotificationAction?> {
    val count = prefs.getInt("count", 0)
    for (index in 0 until count) {
        val actionId = prefs.getString("id$index", null)  // looks for "id0", "id1", ...
    }
}
```

The keys never matched. Write used the string ID; read used `0`, `1`, `2`. Every lookup returned nothing. The plugin couldn't retrieve the actions for any notification it had shown, so `actionId` was always empty. The app's handler, receiving an action with no ID, silently discarded the event.

This was first surfaced by [@Innominus](https://github.com/Innominus) in June 2025, who filed PR [#2805](https://github.com/tauri-apps/plugins-workspace/pull/2805) with a fix and extended it to support registering action types from Rust (previously only possible from JS). The PR sat awaiting review. Eight months later, working on Threshold, the same gap surfaced independently. Finding the existing PR, already diagnosed and already fixed, and joining forces to get it across the finish line is exactly what makes open source great. We are currently working together to merge these improvements so they benefit everyone.

The fix: write with numeric indices too.

```kotlin
for ((index, action) in type.actions.withIndex()) {
    editor.putString("id$index", action.id)    // "id0", "id1", ...
    editor.putString("title$index", action.title)
}
```

A round-trip test was added to prevent regression:

```kotlin
storage.writeActionGroup(listOf(type))
val restored = storage.getActionGroup("alarm-actions")
assertEquals("dismiss", restored[0]!!.id)
assertEquals("snooze", restored[1]!!.id)
```

## Discovery 2: The Payload Shape Mismatch

With the storage issue resolved, action events still arrived with a broken structure in certain conditions. The issue was in how Android serialises notification extras and how the plugin's JavaScript layer expected to receive them.

Android can deliver notification action data in two forms. The simple case is a flat JSON object:

```json
{ "actionId": "dismiss", "notification": { "id": 42 } }
```

But when a notification is reconstructed after a channel reset, or when the extras bundle round-trips through Android's `org.json.JSONObject.toString()` and back, an internal implementation detail leaks into the serialised form:

```json
{
  "nameValuePairs": {
    "actionId": "dismiss",
    "notification": { "nameValuePairs": { "id": 42 } }
  }
}
```

The `nameValuePairs` key is the internal field name that `JSONObject` uses to store its entries. When `toString()` is called on one and then parsed back by a different code path, the wrapper appears in the output. The Tauri bridge was passing this straight through to JavaScript, and the app was expecting the flat form, so `actionId` was `undefined` and the event was discarded.

The fix was a normalisation pass in the guest JS layer. A `normalisePendingActions` function walks the payload recursively, unwrapping any `nameValuePairs` layers and rebuilding a clean `ActionPerformedNotification`:

```typescript
const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // Unwrap Android's internal JSONObject serialisation artefact
  const wrapped = record.nameValuePairs;
  if (wrapped && typeof wrapped === "object") return toRecord(wrapped);
  return record;
};
```

The normaliser also handles array-like objects (`{ 0: ..., length: N }`, another bridge serialisation edge case) and deduplicates events by `notificationId|actionId|inputValue` to prevent double-delivery.

## Discovery 3: The Cold-Start Timing Gap

The third discovery wasn't a data issue; it was structural. Android fires the `BroadcastReceiver` the moment the user taps a notification action. On a cold boot, Threshold's Rust core takes around 400ms to initialise before the bridge is open and events can flow through it. That's not a race you can win by being faster. It's a guaranteed window where any action tapped during startup lands in a void.

The same gap appears after a WebView reload (such as a hot module replacement during development): the plugin's `load()` method resets state, the bridge briefly goes offline, and any action tapped in that window is lost.

### The Listener-Ready Handshake

The fix introduces an explicit readiness protocol. The plugin now buffers action events in Kotlin until the JavaScript layer signals that it's ready to receive them.

On the Android side, every incoming action is checked against a readiness flag. If the listener isn't registered yet, the event is held in a keyed queue and written to `SharedPreferences` immediately so it survives a reload:

```kotlin
private fun dispatchActionPerformed(payload: JSObject) {
    synchronized(this) {
        if (!isActionListenerReady) {
            val key = buildActionEventKey(payload)
            if (!pendingActionEventKeys.contains(key)) {
                pendingActionEvents.add(PendingActionEvent(key, payload, nowMs()))
                pendingActionEventKeys.add(key)
                persistPendingActionEventsLocked()  // survives reload
            }
            return
        }
    }
    triggerJSEvent("actionPerformed", payload)
}
```

On the JavaScript side, `onAction()` now calls `register_action_listener_ready` immediately after attaching the listener. The plugin responds with any events buffered during startup, which are replayed through the same callback:

```typescript
async function onAction(
  cb: (notification: ActionPerformedNotification) => void,
) {
  const listener = await addPluginListener(
    "notification",
    "actionPerformed",
    cb,
  );

  try {
    const pendingResult = await invoke<unknown>(
      "plugin:notification|register_action_listener_ready",
    );
    const pending = normalisePendingActions(pendingResult);
    for (const notification of pending) {
      cb(notification); // replay buffered events
    }
  } catch {
    // Older plugin versions and non-Android targets won't implement this command
  }

  return listener;
}
```

This is a pull-based handshake: the app signals readiness and requests any missed events, rather than the plugin pushing to an unready listener. The `try/catch` makes it backward compatible, so apps on older plugin builds or running on iOS simply skip the replay step.

Persisted events are restored on each `load()` call, filtered to discard anything older than 24 hours, and deduplicated using the same key scheme. A reload mid-delivery no longer loses the event.

### Tauri Permission Wiring

In Tauri v2, every command exposed over the JS bridge requires a permission definition. Adding `register_action_listener_ready` meant generating a new permission file and including it in the plugin's default set:

```toml
# permissions/autogenerated/commands/register_action_listener_ready.toml
[[permission]]
identifier = "allow-register-action-listener-ready"
commands.allow = ["register_action_listener_ready"]
```

```toml
# permissions/default.toml
permissions = [
  "allow-notify",
  "allow-register-action-types",
  "allow-register-listener",
  "allow-register-action-listener-ready", # new
  ...
]
```

Adding it to `default.toml` means apps get the capability without any opt-in changes to their own `capabilities` config.

## Putting Reliable Actions to Work

Alongside the plugin work, Threshold's internal notification architecture was restructured. These changes were about bringing notification orchestration into alignment with the app's existing event-driven architecture, which had evolved during the recent Wear OS work.

**Action ownership** was moved to context owners. Previously, all notification action types had been registered in a single place at startup. This meant a central module had to know about alarm actions, settings actions, and anything added in the future. The plugin's architecture actually supported a much cleaner approach: a provider-based model where each context registers its own types in response to lifecycle events. Adding a new notification type no longer requires an increasingly complex central registry.

**Event-driven services** were already the direction for the core alarm domain. `AlarmNotificationService` was extracted to own the complete lifecycle of a ringing alarm, handling the notification send, registering the action listener, and managing dismiss and snooze events. Centralising this logic made the flow independently testable and kept the core alarm manager out of the notification business. The upstream notification fixes meant this event-driven architecture could finally function on Android exactly as intended, with action events arriving safely and in the expected shape.

**The plugin fork** is currently vendored as a git submodule while the upstream PR completes its review cycle. CI builds the vendored plugin before dependency resolution runs, ensuring the local build artefact is available for contributors.

## What Changed

|                      | Before                                                     | After                                                   |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Action-group storage | Written by string ID, read by numeric index, always missed | Written and read by numeric index                       |
| Action payload shape | `nameValuePairs` wrapper silently broke `actionId`         | Normalised recursively in JS layer                      |
| Cold-start delivery  | Events during 400ms Rust init window lost                  | Buffered in Kotlin, replayed on JS readiness signal     |
| Reload delivery      | In-memory buffer cleared on reload                         | Persisted to `SharedPreferences`, restored on next load |
| Duplicate replay     | Same event could arrive more than once                     | Deduplicated by `notificationId\|actionId\|inputValue`  |

## Beyond Threshold

These fixes are upstream proposals to the Tauri notification plugin for Android. The storage keying, payload normalisation, and listener-ready handshake are structural improvements to the plugin itself. Once the work lands in the main repository, they will simply work out of the box for the entire community.

Building apps on open-source frameworks means inheriting the gaps that exist in those frameworks. But it also presents an amazing opportunity to learn how these systems work under the hood and close the gaps when you find them. Giving back to the ecosystem ensures the next developer does not spend a week tracing the same silent drop through the same delivery chain.

The listener-ready pattern is worth naming as a general approach. Buffering on the native side and draining only after an explicit JS-side readiness signal covers cold starts, reloads, and any timing gap between the OS and an app's event handlers. It is a small amount of infrastructure that eliminates an entire class of silent failures.
