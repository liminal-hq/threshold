// Tauri plugin — publishes alarm data to watch via Wear Data Layer and receives watch messages
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.app.Activity
import android.net.Uri
import android.util.Log
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private const val TAG = "WearSyncPlugin"
private const val DATA_PATH_ALARMS = "/threshold/alarms"
private const val MSG_PATH_SYNC_REQUEST = "/threshold/sync_request"

@InvokeArg
class PublishRequest {
    var alarmsJson: String = ""
    var revision: Long = 0
}

@InvokeArg
class SyncRequest {
    var revision: Long = 0
}

@TauriPlugin
class WearSyncPlugin(private val activity: Activity) : Plugin(activity) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val dataClient by lazy { Wearable.getDataClient(activity) }
    private val messageClient by lazy { Wearable.getMessageClient(activity) }
    private val nodeClient by lazy { Wearable.getNodeClient(activity) }

    override fun load(webview: WebView) {
        super.load(webview)
        instance = this
        Log.d(TAG, "Initialised wear-sync plugin")
    }

    /**
     * Publish alarm data to the connected watch via the Wear Data Layer.
     *
     * Receives serialised alarm JSON and the current revision from the Rust
     * side, writes it to a DataItem at [DATA_PATH_ALARMS] so the watch
     * receives it through its `WearableListenerService`.
     */
    @Command
    fun publishToWatch(invoke: Invoke) {
        val args = invoke.parseArgs(PublishRequest::class.java)
        scope.launch {
            try {
                val request = PutDataMapRequest.create(DATA_PATH_ALARMS).apply {
                    dataMap.putString("alarmsJson", args.alarmsJson)
                    dataMap.putLong("revision", args.revision)
                    dataMap.putLong("timestamp", System.currentTimeMillis())
                }
                request.setUrgent()

                val dataItem = dataClient.putDataItem(request.asPutDataRequest()).await()
                Log.d(TAG, "Published to watch: uri=${dataItem.uri}, revision=${args.revision}")

                // Cache for offline sync (WearMessageService reads this when plugin isn't loaded)
                WearSyncCache.write(activity, args.alarmsJson, args.revision)

                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to publish to watch", e)
                invoke.reject("Failed to publish to watch: ${e.message}")
            }
        }
    }

    /**
     * Send a sync request message to all connected watch nodes.
     *
     * Uses `MessageClient` to send a lightweight message to each connected
     * node, prompting them to request a full or incremental sync.
     */
    @Command
    fun requestSyncFromWatch(invoke: Invoke) {
        val args = invoke.parseArgs(SyncRequest::class.java)
        scope.launch {
            try {
                val nodes = nodeClient.connectedNodes.await()
                Log.d(TAG, "Sending sync request to ${nodes.size} node(s) at revision ${args.revision}")

                for (node in nodes) {
                    val payload = args.revision.toString().toByteArray()
                    messageClient.sendMessage(node.id, MSG_PATH_SYNC_REQUEST, payload).await()
                    Log.d(TAG, "Sent sync request to node ${node.displayName} (${node.id})")
                }
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send sync request", e)
                invoke.reject("Failed to send sync request: ${e.message}")
            }
        }
    }

    /**
     * Called by [WearMessageService] when a message arrives from the watch.
     * Triggers a Tauri event so the Rust side can process it.
     */
    fun onWatchMessage(path: String, data: String) {
        val payload = JSObject().apply {
            put("path", path)
            put("data", data)
        }
        trigger("wear:message:received", payload)
    }

    companion object {
        /**
         * Static reference for [WearMessageService] to call back into the
         * plugin. Set during [load] and cleared implicitly by GC if the
         * plugin is unloaded.
         */
        @Volatile
        var instance: WearSyncPlugin? = null
            private set
    }
}
