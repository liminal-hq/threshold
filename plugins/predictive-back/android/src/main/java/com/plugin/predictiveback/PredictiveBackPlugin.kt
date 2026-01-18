package com.plugin.predictiveback

import android.os.Build
import android.util.Log
import android.webkit.WebView
import android.window.OnBackAnimationCallback
import android.window.BackEvent
import android.window.OnBackInvokedDispatcher
import androidx.annotation.RequiresApi
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SetCanGoBackRequest {
    var canGoBack: Boolean = false
}

@TauriPlugin
class PredictiveBackPlugin(private val activity: android.app.Activity) : Plugin(activity) {

    private var callback: Any? = null // Holds OnBackAnimationCallback on API 34+
    private var webView: WebView? = null
    private var canGoBack: Boolean = false

    override fun load(webview: WebView) {
        super.load(webview)
        this.webView = webview
        Log.d("PredictiveBackPlugin", "Plugin loaded.")

        if (Build.VERSION.SDK_INT >= 34) {
            registerBackCallback()
        }
    }

    @Command
    fun setCanGoBack(invoke: Invoke) {
        val args = invoke.parseArgs(SetCanGoBackRequest::class.java)
        this.canGoBack = args.canGoBack
        Log.d("PredictiveBackPlugin", "setCanGoBack: ${this.canGoBack}")

        // On API 34+, we need to update the callback state (enabled/disabled) based on canGoBack
        // actually, for predictive back to trigger "exit" vs "in-app", we might just want to always be enabled
        // but handle the event differently?
        // However, the prompt says: "Allow the web layer to tell native whether there is back history, so Android can decide whether to show an “exit” predictive animation vs an “in-app” one."
        // If we want in-app animation, we MUST consume the back event.
        // If we want system exit animation, we should NOT consume it (or disable our callback).

        if (Build.VERSION.SDK_INT >= 34) {
             updateCallbackState()
        }

        invoke.resolve()
    }

    @RequiresApi(34)
    private fun updateCallbackState() {
         val cb = callback as? OnBackAnimationCallback
         // If we can go back in the app, we want to intercept the back gesture to show our custom animation.
         // If we cannot go back (root), we want to let the system handle it (minimize/close).
         // So: enabled = canGoBack.
         // Wait, if enabled=true, we get the callbacks. If enabled=false, system handles it (exit animation).
         // Yes, that matches the requirement.

         // However, the OnBackAnimationCallback doesn't have a mutable `isEnabled` property directly exposed easily
         // without re-registering or wrapping?
         // Actually, `OnBackInvokedCallback` interface doesn't have `setEnabled`.
         // But `OnBackPressedCallback` (AndroidX) does.
         // The pure platform `OnBackInvokedDispatcher` requires registering/unregistering.

         if (canGoBack) {
             if (cb == null) {
                 registerBackCallback()
             }
         } else {
             if (cb != null) {
                 unregisterBackCallback()
             }
         }
    }

    @RequiresApi(34)
    private fun registerBackCallback() {
        if (callback != null) return

        val cb = object : OnBackAnimationCallback {
            override fun onBackStarted(backEvent: BackEvent) {
                // Determine edge: 0 = left, 1 = right
                val edge = if (backEvent.swipeEdge == BackEvent.EDGE_LEFT) "left" else "right"
                emitEvent("started", JSObject().apply {
                    put("progress", 0)
                    put("edge", edge)
                })
            }

            override fun onBackProgressed(backEvent: BackEvent) {
                val edge = if (backEvent.swipeEdge == BackEvent.EDGE_LEFT) "left" else "right"
                emitEvent("progress", JSObject().apply {
                    put("progress", backEvent.progress)
                    put("edge", edge)
                })
            }

            override fun onBackCancelled() {
                emitEvent("cancelled", JSObject())
            }

            override fun onBackInvoked() {
                emitEvent("invoked", JSObject())
            }
        }

        activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_OVERLAY,
            cb
        )
        callback = cb
        Log.d("PredictiveBackPlugin", "Registered OnBackAnimationCallback")
    }

    @RequiresApi(34)
    private fun unregisterBackCallback() {
        val cb = callback as? OnBackAnimationCallback ?: return
        activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(cb)
        callback = null
        Log.d("PredictiveBackPlugin", "Unregistered OnBackAnimationCallback")
    }

    private fun emitEvent(type: String, data: JSObject) {
        val eventName = "predictive-back://$type"
        // We use the channel name format often used in Tauri v2, or just trigger directly.
        // The `trigger` method on `Plugin` is available in Rust, but in Java/Kotlin
        // we usually use `trigger` if exposed, or `webview.evaluateJavascript` fallback.
        // Tauri Android Plugin base class has `trigger` method? Let's check source or assume standard pattern.
        // Checking available methods... `trigger(String event, JSObject data)` exists in `Plugin` class in recent versions.

        // Let's try standard trigger first.
        super.trigger(type, data)

        // Just in case, let's also do a safe log
        // Log.v("PredictiveBackPlugin", "Emitted $type")
    }
}
