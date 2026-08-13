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
 */
object NativeFanOutPrefs {

    fun isNativeFanOutEnabled(context: Context): Boolean {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_NATIVE_FAN_OUT_ENABLED, true)
    }

    fun setNativeFanOutEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_NATIVE_FAN_OUT_ENABLED, enabled)
            .apply()
    }
}
