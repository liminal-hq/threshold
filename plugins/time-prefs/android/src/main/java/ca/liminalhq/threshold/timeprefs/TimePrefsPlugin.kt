package ca.liminalhq.threshold.timeprefs

import android.app.Activity
import android.text.format.DateFormat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class TimePrefsPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getTimeFormat(invoke: Invoke) {
        val is24 = DateFormat.is24HourFormat(activity.applicationContext)

        val ret = JSObject()
        ret.put("is24Hour", is24)
        invoke.resolve(ret)
    }
}
