// Reads native OS preferences (time format, animation scale) Threshold's frontend needs
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.osprefs

import android.app.Activity
import android.util.Log
import android.text.format.DateFormat
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class OsPrefsPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getTimeFormat(invoke: Invoke) {
        Log.d("OsPrefsPlugin", "getTimeFormat")
        val is24 = DateFormat.is24HourFormat(activity.applicationContext)

        val ret = JSObject()
        ret.put("is24Hour", is24)
        invoke.resolve(ret)
    }

    // Developer options' "Animator duration scale" (0x/0.5x/1x/2x/5x/10x, default 1x) --
    // separate from the "Remove animations" accessibility toggle (which zeroes this same
    // value, and which Chromium already surfaces to the webview as prefers-reduced-motion).
    // This lets CSS-driven animations scale proportionally with a user's chosen debug/
    // accessibility speed instead of just reduced-motion's on/off.
    @Command
    fun getAnimatorDurationScale(invoke: Invoke) {
        val scale = Settings.Global.getFloat(
            activity.applicationContext.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1.0f
        )
        Log.d("OsPrefsPlugin", "getAnimatorDurationScale: $scale")

        val ret = JSObject()
        ret.put("scale", scale)
        invoke.resolve(ret)
    }
}
