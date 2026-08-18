// ContentProvider spike proving init-ordering for issue #255's shared native event bus
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.util.Log

private const val TAG = "BusInitProvider"

// Safety cap for maybeStallForSpikeThreadingCheck() below -- AlarmReceiver.onReceive() calls
// startForegroundService() in this same cold-start chain, and Android gives that call roughly
// a 5s window before throwing ForegroundServiceDidNotStartInTimeException / ANRing. A stall
// anywhere near that window isn't "more evidence", it's a different failure mode, so it's
// clamped in code rather than trusting the Gradle property alone.
private const val MAX_SPIKE_STALL_MS = 2000

/**
 * Throwaway spike for issue #255 Phase 0.
 *
 * `ContentProvider.onCreate()` is documented to run before any `Activity`/`Service`/`BroadcastReceiver` callback in the app, even on a genuinely cold multi-plugin process start (this is the Jetpack/WorkManager/Firebase pattern for guaranteed early init). The later phases of #255 want a shared native event bus where every plugin registers its listeners this way, so subscribers exist before `AlarmReceiver.onReceive()` can fire. This provider exists solely to prove that assumption against a real device before any production code depends on it -- it is not, and must not become, a real content provider.
 *
 * See `docs/spikes/255-contentprovider-spike-protocol.md` for how to validate this on a device, and `AlarmReceiver.onReceive()` in plugins/alarm-manager for the matching instrumentation line this provider's timestamp needs to be compared against.
 */
class BusInitProvider : ContentProvider() {

    override fun onCreate(): Boolean {
        val ctx = context
        if (ctx == null) {
            // ContentProvider.onCreate() is documented to always have an attached Context by
            // the time it runs; this is defensive only, not an expected path.
            Log.e(TAG, "onCreate() called with no attached Context")
            return true
        }

        // Deliberately independent of the NativeEventLog call below: NativeEventLog swallows
        // its own write failures (see its own try/catch), and Test 2 (BOOT_COMPLETED) in the
        // protocol doc is exactly the scenario where credential-encrypted storage may not be
        // accessible yet under Direct Boot. This plain logcat line is a second signal that
        // survives even if that file write silently fails, so "no NativeEventLog evidence"
        // doesn't get misread as "ordering violated".
        Log.i(TAG, "BusInitProvider.onCreate() fired")
        NativeEventLog.log(ctx, TAG, "BusInitProvider.onCreate() fired")

        verifySingleProcessInvariant(ctx)
        maybeStallForSpikeThreadingCheck(ctx)

        return true
    }

    /**
     * The event bus design #255 is de-risking assumes the whole app -- every plugin included -- runs in a single OS process, since the planned in-memory hub can't cross a process boundary. Verify that here, at the earliest guaranteed callback in the app's lifecycle, so a future regression (e.g. someone adding `android:process` to a manifest entry) is caught loudly in debug builds rather than silently breaking event delivery in production.
     */
    private fun verifySingleProcessInvariant(context: Context) {
        val processName = currentProcessName()
        if (processName == null) {
            // Couldn't determine it at all (only possible on the reflection fallback path
            // below) -- that's a "can't verify", not a "verified false", so don't fail either
            // build type on it.
            Log.w(TAG, "Could not determine current process name; skipping single-process invariant check")
            return
        }

        val singleProcess = processName == context.packageName
        if (BuildConfig.DEBUG) {
            check(singleProcess) {
                "Threshold's native event bus design (#255) assumes a single-process app, " +
                    "but this process is '$processName' (expected '${context.packageName}')"
            }
        } else if (!singleProcess) {
            Log.e(
                TAG,
                "Single-process invariant violated: process='$processName', " +
                    "expected='${context.packageName}'. See issue #255.",
            )
            NativeEventLog.log(
                context,
                TAG,
                "ERROR: single-process invariant violated, process=$processName",
            )
        }
    }

    /**
     * API 28+ exposes [Application.getProcessName] directly. Below that -- down to this app's minSdk 26 -- there's no public API, so fall back to the hidden `ActivityThread.currentProcessName()` static method via reflection, the same trick AndroidX-adjacent early-init code uses for this exact gap.
     */
    @Suppress("PrivateApi", "DiscouragedPrivateApi")
    private fun currentProcessName(): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return Application.getProcessName()
        }

        return try {
            val activityThreadClass = Class.forName("android.app.ActivityThread")
            val method = activityThreadClass.getDeclaredMethod("currentProcessName")
            method.invoke(null) as? String
        } catch (e: ReflectiveOperationException) {
            Log.w(TAG, "Reflection fallback for process name failed on API ${Build.VERSION.SDK_INT}", e)
            null
        } catch (e: SecurityException) {
            // Some OEM/enterprise builds harden reflection access on API 26-27 and throw
            // SecurityException instead of a ReflectiveOperationException -- catch it too so
            // this degrades to "can't verify" instead of crashing onCreate() outright.
            Log.w(TAG, "Reflection fallback for process name blocked by SecurityException on API ${Build.VERSION.SDK_INT}", e)
            null
        }
    }

    /**
     * Spike-only (#255 Phase 0). Never runs outside debug builds, and never runs unless explicitly enabled at build time via the `busSpikeStallMs` Gradle property (see `BuildConfig.BUS_SPIKE_STALL_MS` in build.gradle.kts) -- normal debug builds are unaffected. Lets a human tester simulate a slow/blocking `onCreate()` during cold start, to confirm on a real device that it doesn't measurably delay AlarmRingingService's audio start and doesn't trip StrictMode. Clamped to [MAX_SPIKE_STALL_MS] regardless of what's requested, since AlarmReceiver.onReceive()'s startForegroundService() call is in this same cold-start chain and a stall long enough to matter there stops being a threading-contract check and starts being a ForegroundServiceDidNotStartInTimeException. Delete this method (and the Gradle property) once Phase 0 wraps up.
     */
    private fun maybeStallForSpikeThreadingCheck(context: Context) {
        if (!BuildConfig.DEBUG || BuildConfig.BUS_SPIKE_STALL_MS <= 0) {
            return
        }

        val stallMs = BuildConfig.BUS_SPIKE_STALL_MS.coerceAtMost(MAX_SPIKE_STALL_MS)
        if (stallMs < BuildConfig.BUS_SPIKE_STALL_MS) {
            Log.w(TAG, "Requested stall ${BuildConfig.BUS_SPIKE_STALL_MS}ms clamped to ${stallMs}ms (#255 Phase 0 safety cap)")
        }

        Log.w(TAG, "Spike instrumentation: stalling onCreate() for ${stallMs}ms (#255 Phase 0)")
        NativeEventLog.log(
            context,
            TAG,
            "Spike stall: sleeping ${stallMs}ms in onCreate() (#255 Phase 0)",
        )
        Thread.sleep(stallMs.toLong())
    }

    // Everything below is a deliberate no-op -- this is not a real content provider, it
    // exists purely for the onCreate() timing guarantee above.

    override fun query(
        uri: Uri,
        projection: Array<String>?,
        selection: String?,
        selectionArgs: Array<String>?,
        sortOrder: String?,
    ): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<String>?,
    ): Int = 0
}
