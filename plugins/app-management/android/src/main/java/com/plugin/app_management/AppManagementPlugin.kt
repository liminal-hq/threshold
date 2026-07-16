// Minimises the app to the background via moveTaskToBack
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.app_management

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

private const val TAG = "AppManagementPlugin"

@TauriPlugin
class AppManagementPlugin(private val activity: Activity): Plugin(activity) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Command
    fun minimizeApp(invoke: Invoke) {
        // moveTaskToBack(true) minimizes the activity without killing it.
        // It effectively behaves like the Home button.
        val success = activity.moveTaskToBack(true)
        if (success) {
            invoke.resolve()
        } else {
            invoke.reject("Failed to move task to back")
        }
        // Tauri's Android bridge runs @Command bodies on the main/UI thread, and this
        // command is also awaited from a directly-invoked Tauri command via the blocking
        // `run_mobile_plugin` path -- resolving first unblocks the Rust-side wait, but the
        // NativeEventLog write itself (synchronous, @Synchronized disk I/O) still needs
        // moving off-thread on its own, same pattern WearSyncPlugin's `scope` uses, so it
        // doesn't add to the UI thread's work on every app-backgrounding gesture either.
        scope.launch {
            NativeEventLog.log(activity, TAG, "minimizeApp called, moveTaskToBack result=$success")
        }
    }
}
