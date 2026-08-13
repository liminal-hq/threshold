// SharedPreferences-backed developer toggle for wear-sync's native fired->watch-ring fan-out
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Context

private const val PREFS_NAME = "ThresholdWearSyncDevOptions"
private const val KEY_NATIVE_FAN_OUT_ENABLED = "native_fan_out_enabled"

/**
 * Developer-only toggle (issue #255 Phase 3B) letting a tester disable
 * [NativeFiredListener]'s in-process fired→watch-ring fan-out, so the pre-existing Rust
 * `alarm:fired` → `send_alarm_ring` path can be exercised in isolation. Defaults to
 * enabled (`true`) -- the native path is this phase's shipped production behaviour, and
 * this toggle exists purely to make the older path testable on demand, not as a rollout
 * kill switch.
 *
 * A distinct SharedPreferences file from [WearSyncCache] and [WearSyncEventQueue]'s: this
 * is developer-only state, not sync data, and keeping it separate means it's trivial to
 * clear independently (e.g. "reset developer options") without touching cached alarm data.
 *
 * [isNativeFanOutEnabled] is read from [NativeFiredListener.handle], which -- per
 * [ca.liminalhq.threshold.nativebus.NativeEventBus]'s threading contract -- must stay cheap
 * and non-blocking. A `SharedPreferences` file's *first* access on a cold process can block
 * on its background XML load, so this class keeps an in-memory [cachedEnabled] on top of the
 * real store: [warm] (called once by [WearRingInitProvider.onCreate], before
 * [NativeFiredListener] is even registered) pays that cost up front, off the fired-event
 * path entirely, so every later [isNativeFanOutEnabled] call -- including the one inside
 * [NativeFiredListener.handle] -- is a plain volatile-field read.
 */
object NativeFanOutPrefs {

    // Written once by warm() (main thread, during WearRingInitProvider.onCreate) and by
    // setNativeFanOutEnabled() (the settings toggle's own IO-dispatcher scope); read from
    // NativeFiredListener's own coroutine dispatcher. @Volatile makes those writes visible
    // across threads without needing a lock for what's otherwise a single boolean read.
    @Volatile
    private var cachedEnabled: Boolean? = null

    /**
     * Pre-loads [cachedEnabled] from disk. Must be called once, early -- see the class KDoc
     * for why this exists and why it has to run before [NativeFiredListener] is registered.
     * Safe to call more than once (e.g. a future second provider); each call just re-reads
     * the same file.
     */
    fun warm(context: Context) {
        cachedEnabled = readFromDisk(context)
    }

    /**
     * Whether native fan-out is enabled. Served from [cachedEnabled] when available (the
     * expected path once [warm] has run); falls back to a direct (possibly blocking) disk
     * read otherwise, purely as a defensive fallback for a caller that reaches this before
     * [warm] -- not expected to happen given the registration ordering [warm]'s caller
     * relies on, but safer than crashing or lying about the toggle's value if it somehow did.
     */
    fun isNativeFanOutEnabled(context: Context): Boolean {
        return cachedEnabled ?: readFromDisk(context).also { cachedEnabled = it }
    }

    fun setNativeFanOutEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_NATIVE_FAN_OUT_ENABLED, enabled)
            .apply()
        cachedEnabled = enabled
    }

    private fun readFromDisk(context: Context): Boolean {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_NATIVE_FAN_OUT_ENABLED, true)
    }
}
