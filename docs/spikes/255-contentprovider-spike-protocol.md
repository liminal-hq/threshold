# Issue #255 Phase 0: ContentProvider Registration-Ordering Spike — Test Protocol

**Status:** Throwaway spike, not production code. Read this alongside `plugins/wear-sync/android/src/main/java/ca/liminalhq/threshold/wearsync/BusInitProvider.kt`, which has the full rationale in its KDoc.

## What this spike is trying to prove

Issue #255 plans a shared native event bus where every subscribing plugin registers its listeners from a manifest-declared `ContentProvider`, on the theory that `ContentProvider.onCreate()` is guaranteed by the platform to run before any `Activity`/`Service`/`BroadcastReceiver` callback in the app, even on a genuinely cold, multi-plugin process start. That guarantee is the load-bearing assumption for the whole later design: if it doesn't hold in practice on real devices, listeners could register too late to catch an `AlarmReceiver.onReceive()` that fires immediately on cold start (the exact failure mode this bus exists to prevent). This phase adds one throwaway `ContentProvider` (`BusInitProvider`, in wear-sync) plus one extra log line in `AlarmReceiver.onReceive()`, both writing timestamped entries through the existing `NativeEventLog` mechanism, so the ordering can be checked directly against a real device's log export. Nothing here is meant to survive past Phase 0 — no production code depends on `BusInitProvider` today.

## Before you start

- Build a debug APK with these changes and install it on a real device (an emulator can behave differently for cold-start process death/broadcast delivery timing, so a real device is strongly preferred for the ordering checks below).
- You'll need the device's package name (`ca.liminalhq.threshold` unless overridden) and either `adb shell run-as` or a rooted/debuggable-build file pull to retrieve `NativeEventLog`'s output, or simpler: use the app's own "Export event log" feature if there's a UI entry point for it, since that already merges every `Threshold*.log` file (`Threshold-wear-sync.log` and `Threshold-alarm-manager.log` in this case) it finds in `app_log_dir()`.
- Each `NativeEventLog` line is timestamped to millisecond precision (`yyyy-MM-dd HH:mm:ss.SSS`), so ordering comparisons don't depend on log line order — read the actual timestamps.

## Important: how to kill the app between test runs

Use `adb shell am kill <package>` or a full device reboot to force a genuinely cold process start. **Do not use `adb shell am force-stop <package>`.** Force-stop puts the app into Android's "stopped" state, which can suppress broadcast delivery entirely (including `BOOT_COMPLETED` and, on some OS versions, exact-alarm broadcasts) until the user manually relaunches the app — that would either give you a false negative (no `AlarmReceiver.onReceive()` at all) or mask exactly the cold-start race this spike is testing. `am kill` terminates the process the same way low-memory process death would, without touching the app's stopped-state flag, which is the condition we actually care about reproducing.

## Test 1: Alarm-fire cold start

This is the scenario that matters most, since it's the one `AlarmReceiver.onReceive()` handles directly.

1. Build and install the debug APK (see "Before you start").
2. Open the app once and schedule a real alarm a few minutes out.
3. Force the app's process to die with `adb shell am kill <package>` (not force-stop — see above). Confirm it's actually gone with `adb shell ps | grep <package>` before proceeding.
4. Wait for the alarm to fire without touching the device or reopening the app.
5. Once the alarm is ringing, pull the merged log (or the two individual `Threshold-wear-sync.log` / `Threshold-alarm-manager.log` files) and find:
   - `[BusInitProvider] BusInitProvider.onCreate() fired`
   - `[AlarmReceiver] #255 Phase 0 spike: onReceive() fired`
6. **Pass condition:** the `BusInitProvider` timestamp is strictly earlier than the `AlarmReceiver` timestamp. Also check for a `verifySingleProcessInvariant` failure or an `ERROR: single-process invariant violated` line — either indicates the process-model assumption itself doesn't hold on this device/OS build, which is a separate and more serious finding than ordering.
7. Repeat this run at least 3 times — cold-start ordering guarantees are architectural, not timing-dependent, so it should be deterministic, but a device-specific OEM process-management quirk showing up intermittently is exactly the kind of thing this spike exists to catch.

## Test 2: Boot-completed path

`BootReceiver` reschedules alarms after `BOOT_COMPLETED`, which is its own cold-start entry point distinct from an already-scheduled alarm firing.

1. With at least one alarm scheduled, reboot the device fully (`adb reboot` or physically).
2. After the device finishes booting, without opening the app, pull the logs once boot-completed processing has had time to run.
3. Confirm `BusInitProvider.onCreate()` precedes both the `BootReceiver` boot-completed log line and the `AlarmReceiver` spike line (if an alarm also fires during this session) in the merged log.
4. Note: a reboot is a real cold start by construction, so this test also implicitly re-validates Test 1's guarantee under a different entry point.

## Test 3: Notification-tap-while-backgrounded path

This checks the ordering when the process is alive-but-backgrounded rather than fully cold, which is a different (and generally lower-risk) code path, but worth confirming doesn't regress the invariant checks.

1. With the app installed and previously opened at least once (so its process may still be resident, or may have been reclaimed by the OS in the background — either is fine, don't force this one), let a scheduled alarm fire while the app is backgrounded (not force-killed).
2. Tap the alarm notification to bring the app to the foreground.
3. Pull the logs and confirm `BusInitProvider.onCreate()` still appears with a timestamp at or before `AlarmReceiver`'s spike line if the process actually was recreated; if the process was still resident, `BusInitProvider.onCreate()` won't re-fire at all (`ContentProvider.onCreate()` only runs once per process lifetime) — that's expected and not a failure, just note whether the process was cold or warm for this run based on whether the `BusInitProvider` line is fresh or from an earlier run.

## Test 4: Slow-`onCreate()` threading sanity check

The later phases of #255 depend on `ContentProvider.onCreate()` running on the main thread without becoming a startup bottleneck. `BusInitProvider` has a debug-only, build-time-gated stall for exactly this check — see `maybeStallForSpikeThreadingCheck()` in `BusInitProvider.kt` and the `busSpikeStallMs` Gradle property in `plugins/wear-sync/android/build.gradle.kts`.

1. Build a debug APK with the stall enabled, e.g.:
   ```
   ./gradlew assembleDebug -PbusSpikeStallMs=3000
   ```
   (run from wherever this plugin is normally built for the app — this flag only has an effect on debug builds; it's a no-op if the app is built without passing it, and it's structurally impossible to enable on a release build since the check is gated on `BuildConfig.DEBUG`.)
2. Install the resulting APK and repeat Test 1 (alarm-fire cold start).
3. With StrictMode enabled (Developer Options → confirm "Strict Mode enabled" is on, or add a temporary `StrictMode.setThreadPolicy`/`setVmPolicy` call if the app doesn't already enable it in debug builds), watch logcat for any StrictMode violation around the alarm-fire window.
4. Time the gap between the alarm's scheduled fire time and audible/visible ringing start (stopwatch against the device clock is fine for a rough spike check — this doesn't need to be precise). **Pass condition:** no measurable added delay to `AlarmRingingService`'s audio start beyond the deliberately-injected `busSpikeStallMs` itself, and no StrictMode violations attributable to `BusInitProvider`.
5. Rebuild without `-PbusSpikeStallMs` (or with `-PbusSpikeStallMs=0`) before doing anything else with this build — don't leave the stall enabled in a build you keep using.

## Test 5: Re-confirm the #254 background-activity-launch findings still hold

Unrelated to the `ContentProvider` question, but cheap to re-check while already doing real-device alarm-fire testing: `AlarmRingingService.kt` has a comment (search the file for `BAL_BLOCK`) recording that a plain `startActivity()` call made directly from the foreground service context is rejected by Android's background-activity-launch restrictions, even during the alarm-clock temporary allowlist window — and that the allowlist exemption covers starting the foreground service itself, not an `Activity` launch from within it, which is why the full-screen-intent `PendingIntent` path is used instead. "Still holds" here means: on the current OS build under test, confirm the app still relies on (and needs) the full-screen-intent path — i.e. that a direct `startActivity()` from `AlarmRingingService` would still be rejected the same way, not that anyone should actually change the code to test this. The practical way to re-confirm without modifying production code: watch logcat during Test 1's alarm-fire for any `BAL_BLOCK`-related warning if the full-screen-intent path is ever skipped by the OS (e.g. due to notification permission or full-screen-intent permission being revoked in system settings for this test device), and confirm the ringing UI still only ever appears via the full-screen intent, never via an unexplained direct activity launch. If Android's BAL enforcement has changed on the OS build under test (loosened or tightened), note it here rather than assuming the 2026 comment still applies verbatim — the constraints in that comment were observed once, not guaranteed by any documented, versioned API contract.

## Reporting results

For each test, record: device model + OS version, pass/fail against the stated condition, and the raw relevant log lines (or a screenshot of them) as evidence. If `verifySingleProcessInvariant` ever logs an error or throws, that's a hard blocker for the Phase 1 design regardless of what the ordering tests show, and should be flagged before Phase 1 work proceeds in the other worktree.
