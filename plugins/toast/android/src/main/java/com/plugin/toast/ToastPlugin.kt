package com.plugin.toast

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class ShowToastArgs {
    var message: String? = null
    var duration: String? = null
    var position: String? = null
}

@TauriPlugin
class ToastPlugin(private val activity: Activity) : Plugin(activity) {
    private val implementation = ToastBridge(activity)

    @Command
    fun show(invoke: Invoke) {
        val args = invoke.parseArgs(ShowToastArgs::class.java)
        val message = args.message?.trim()

        if (message.isNullOrEmpty()) {
            invoke.reject("message is required")
            return
        }

        implementation.show(message, args.duration, args.position)
        invoke.resolve()
    }
}
