// Android predictive-back ("peek") gesture bridge — API 33+ OnBackAnimationCallback to Rust
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.predictiveback

import android.app.Activity
import android.os.Build
import android.util.Log
import android.webkit.WebView
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedDispatcher
import androidx.annotation.RequiresApi
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SetCanGoBackArgs {
    var canGoBack: Boolean = false
}

@InvokeArg
class PredictiveBackEventHandlerArgs {
    lateinit var handler: Channel
}

@TauriPlugin
class PredictiveBackPlugin(private val activity: Activity) : Plugin(activity) {

    private var eventChannel: Channel? = null
    private var canGoBack: Boolean = false
    private var callback: OnBackAnimationCallback? = null

    override fun load(webView: WebView) {
        super.load(webView)
        Log.d(TAG, "Plugin loaded.")
    }

    // The system's OnBackInvokedDispatcher registration doesn't reliably survive an Activity
    // pause/resume cycle (e.g. screen off then back on) even though our own `callback` object
    // reference does -- without this, registerCallback()'s "already have a callback" guard
    // would skip re-registering, silently leaving the gesture dead until the app was restarted.
    // Force a clean re-registration on every resume rather than trusting that guard here.
    override fun onResume() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        unregisterCallback()
        updateCallbackRegistration()
    }

    // Registered once at startup, mirroring AlarmManagerPlugin's setAlarmEventHandler. Unlike
    // that plugin's channels, this one needs no SharedPreferences replay queue -- a back
    // gesture can only occur while the Activity (and this channel) is already live, so there's
    // no cold-start delivery gap to bridge.
    @Command
    fun setPredictiveBackHandler(invoke: Invoke) {
        val args = invoke.parseArgs(PredictiveBackEventHandlerArgs::class.java)
        eventChannel = args.handler
        Log.d(TAG, "Predictive back event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun setCanGoBack(invoke: Invoke) {
        val args = invoke.parseArgs(SetCanGoBackArgs::class.java)
        canGoBack = args.canGoBack
        Log.d(TAG, "setCanGoBack: $canGoBack")
        updateCallbackRegistration()
        invoke.resolve()
    }

    private fun updateCallbackRegistration() {
        // OnBackAnimationCallback/BackEvent shipped in API 33 (Tiramisu). Below that, the
        // system back button just works as it always has -- nothing to register.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return

        if (shouldRegisterPredictiveBack(Build.VERSION.SDK_INT, canGoBack)) {
            registerCallback()
        } else {
            unregisterCallback()
        }
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun registerCallback() {
        if (callback != null) return

        val cb = object : OnBackAnimationCallback {
            override fun onBackStarted(backEvent: BackEvent) {
                sendEvent("started", backEvent.progress)
            }

            override fun onBackProgressed(backEvent: BackEvent) {
                sendEvent("progress", backEvent.progress)
            }

            override fun onBackCancelled() {
                sendEvent("cancelled", 0f)
            }

            override fun onBackInvoked() {
                sendEvent("invoked", 1f)
            }
        }

        // PRIORITY_DEFAULT, not PRIORITY_OVERLAY -- this is standard in-app back navigation,
        // not a dialog/overlay dismissal that needs to pre-empt other callbacks.
        activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_DEFAULT,
            cb
        )
        callback = cb
        Log.d(TAG, "Registered OnBackAnimationCallback")
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun unregisterCallback() {
        val cb = callback ?: return
        activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(cb)
        callback = null
        Log.d(TAG, "Unregistered OnBackAnimationCallback")
    }

    private fun sendEvent(type: String, progress: Float) {
        val channel = eventChannel ?: return
        try {
            val event = JSObject().apply {
                put("type", type)
                put("progress", progress)
            }
            channel.send(event)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to dispatch predictive-back '$type' event", e)
        }
    }

    companion object {
        private const val TAG = "PredictiveBackPlugin"
    }
}

/**
 * Whether the native `OnBackAnimationCallback` should be registered, given the platform's API
 * level and whether the webview currently has anywhere in-app for a back gesture to go.
 * Extracted as a pure function (parameterised on `sdkInt` rather than reading
 * `Build.VERSION.SDK_INT` directly) so it's unit-testable on a plain JVM, without Robolectric.
 */
internal fun shouldRegisterPredictiveBack(sdkInt: Int, canGoBack: Boolean): Boolean {
    return sdkInt >= Build.VERSION_CODES.TIRAMISU && canGoBack
}
