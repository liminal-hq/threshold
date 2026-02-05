package ca.liminalhq.threshold.wearsync

import android.app.Activity
import android.util.Log
import android.webkit.WebView
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin

@TauriPlugin
class WearSyncPlugin(activity: Activity) : Plugin(activity) {

    override fun load(webview: WebView) {
        super.load(webview)
        Log.d("WearSyncPlugin", "Initialised wear-sync plugin")
    }
}
