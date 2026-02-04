package com.plugin.app_management

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@TauriPlugin
class AppManagementPlugin(private val activity: Activity): Plugin(activity) {

    @Command
    fun minimize_app(invoke: Invoke) {
        // moveTaskToBack(true) minimizes the activity without killing it.
        // It effectively behaves like the Home button.
        val success = activity.moveTaskToBack(true)
        if (success) {
            invoke.resolve()
        } else {
            invoke.reject("Failed to move task to back")
        }
    }
}
