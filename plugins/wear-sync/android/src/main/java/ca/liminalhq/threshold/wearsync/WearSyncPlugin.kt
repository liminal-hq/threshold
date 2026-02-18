// Tauri plugin — publishes alarm data to watch via Wear Data Layer and receives watch messages
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.app.Activity
import android.util.Log
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
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
private const val EXTRA_HEADLESS_BOOT = "wear_sync_headless_boot"

@InvokeArg
class PublishRequest {
    var alarmsJson: String = ""
    var revision: Long = 0
}

@InvokeArg
class SyncRequest {
    var revision: Long = 0
}

@InvokeArg
class WatchMessageHandlerArgs {
    lateinit var handler: Channel
}

@TauriPlugin
class WearSyncPlugin(private val activity: Activity) : Plugin(activity) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val dataClient by lazy { Wearable.getDataClient(activity) }
    private val messageClient by lazy { Wearable.getMessageClient(activity) }
    private val nodeClient by lazy { Wearable.getNodeClient(activity) }
    private var watchMessageChannel: Channel? = null
    @Volatile
    private var watchPipelineReady: Boolean = false

    override fun load(webview: WebView) {
        super.load(webview)
        instance = this
        Log.d(TAG, "Initialised wear-sync plugin")

        // If the activity was launched for a wear-sync cold boot, push it to
        // the background as early as possible to minimise visible flashing.
        if (activity.intent?.getBooleanExtra(EXTRA_HEADLESS_BOOT, false) == true) {
            moveActivityToBack()
        }
    }

    /**
     * Publish alarm data to the connected watch via the Wear Data Layer.
     *
     * Receives serialised alarm JSON and the current revision from the Rust
     * side, writes it to a DataItem at [DATA_PATH_ALARMS] so the watch
     * receives it through its `WearableListenerService`.
     */
    @Command
    fun publish_to_watch(invoke: Invoke) {
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
    fun request_sync_from_watch(invoke: Invoke) {
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
     * Register a [Channel] for sending watch messages from Kotlin back to Rust.
     *
     * Called by the Rust plugin setup via `run_mobile_plugin("set_watch_message_handler", ...)`.
     * The channel is backed by JNI so data flows directly Kotlin → Rust without
     * going through the WebView/JS layer.
     */
    @Command
    fun set_watch_message_handler(invoke: Invoke) {
        val args = invoke.parseArgs(WatchMessageHandlerArgs::class.java)
        watchMessageChannel = args.handler
        Log.d(TAG, "Watch message handler channel registered")
        drainQueuedMessages()

        invoke.resolve()
    }

    /**
     * Mark the watch message pipeline as ready and drain queued messages.
     *
     * Called by Rust after the app crate has registered watch event listeners.
     */
    @Command
    fun mark_watch_pipeline_ready(invoke: Invoke) {
        watchPipelineReady = true
        Log.d(TAG, "Watch pipeline marked ready")
        drainQueuedMessages()
        invoke.resolve()
    }

    /**
     * Move the host activity to the back of the task stack.
     *
     * Called by [WearSyncService] after cold-booting the Tauri runtime so
     * the user doesn't see the app flash to the foreground.
     */
    fun moveActivityToBack() {
        activity.runOnUiThread {
            val moved = activity.moveTaskToBack(true)
            Log.d(TAG, "moveTaskToBack result: $moved")
        }
    }

    /**
     * Called by [WearMessageService] when a message arrives from the watch.
     *
     * Sends the message to Rust via the [Channel] registered by
     * [set_watch_message_handler]. The Rust side receives the data directly
     * through JNI without involving the WebView.
     */
    fun onWatchMessage(path: String, data: String) {
        if (!watchPipelineReady) {
            WearSyncQueue.enqueue(activity, path, data)
            Log.i(TAG, "Watch pipeline not ready, queued message: path=$path")
            return
        }

        val event = JSObject()
        event.put("path", path)
        event.put("data", data)

        val channel = watchMessageChannel
        if (channel != null) {
            channel.send(event)
            Log.d(TAG, "Sent watch message to Rust channel: path=$path")
        } else {
            WearSyncQueue.enqueue(activity, path, data)
            Log.w(TAG, "Watch message channel not registered, queued message: path=$path")
        }
    }

    private fun drainQueuedMessages() {
        if (!watchPipelineReady || watchMessageChannel == null) {
            return
        }

        val queued = WearSyncQueue.drainAll(activity)
        if (queued.isNotEmpty()) {
            Log.i(TAG, "Replaying ${queued.size} queued message(s)")
            for ((path, data) in queued) {
                onWatchMessage(path, data)
            }
        }
    }

    /** Whether the Kotlin→Rust Channel has been registered and is ready. */
    val isChannelReady: Boolean get() = watchMessageChannel != null

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
