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
import org.json.JSONObject

private const val TAG = "WearSyncPlugin"
private const val DATA_PATH_ALARMS = "/threshold/alarms"
private const val MSG_PATH_SYNC_REQUEST = "/threshold/sync_request"
private const val MSG_PATH_ALARM_RING = "/threshold/alarm_ring"
private const val MSG_PATH_ALARM_DISMISS = "/threshold/alarm_dismiss"
private const val MSG_PATH_ALARM_SNOOZE = "/threshold/alarm_snooze"
private const val MSG_PATH_LOG_REQUEST = "/threshold/log_request"
private const val EXTRA_HEADLESS_BOOT = "wear_sync_headless_boot"

@InvokeArg
class PublishRequest {
    var alarmsJson: String = ""
    var revision: Long = 0
    var snoozeLengthMinutes: Int = 10
    var is24Hour: Boolean = false
    var is24HourKnown: Boolean = false
}

@InvokeArg
class SyncRequest {
    var revision: Long = 0
}

@InvokeArg
class AlarmRingRequest {
    var alarmId: Int = -1
    var label: String = ""
    // Null means "use the device's current time"; the Rust side omits the
    // key entirely rather than sending JSON null (see AlarmRingRequest in
    // wear-sync's models.rs).
    var hour: Int? = null
    var minute: Int? = null
    var snoozeLengthMinutes: Int = 10
    var is24Hour: Boolean = false
    var is24HourKnown: Boolean = false
}

@InvokeArg
class AlarmDismissRequest {
    var alarmId: Int = -1
}

@InvokeArg
class AlarmSnoozeRequest {
    var alarmId: Int = -1
    var snoozeLengthMinutes: Int = 10
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
    // Must go through the process-wide singleton, not a fresh instance -- see
    // WearSyncEventQueue.getInstance's KDoc for why a second, independently-constructed
    // instance over the same SharedPreferences file provides no mutual exclusion against
    // this one, or against WearMessageService's own offline-write enqueues.
    private val watchQueue by lazy { WearSyncEventQueue.getInstance(activity) }
    private var watchMessageChannel: Channel? = null
    @Volatile
    private var watchPipelineReady: Boolean = false

    override fun load(webView: WebView) {
        super.load(webView)
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
    fun publishToWatch(invoke: Invoke) {
        val args = invoke.parseArgs(PublishRequest::class.java)
        scope.launch {
            try {
                val request = PutDataMapRequest.create(DATA_PATH_ALARMS).apply {
                    dataMap.putString("alarmsJson", args.alarmsJson)
                    dataMap.putLong("revision", args.revision)
                    dataMap.putLong("timestamp", System.currentTimeMillis())
                    dataMap.putInt("snoozeLengthMinutes", args.snoozeLengthMinutes)
                    dataMap.putBoolean("is24Hour", args.is24Hour)
                    dataMap.putBoolean("is24HourKnown", args.is24HourKnown)
                }
                request.setUrgent()

                val dataItem = dataClient.putDataItem(request.asPutDataRequest()).await()
                Log.d(TAG, "Published to watch: uri=${dataItem.uri}, revision=${args.revision}, snooze=${args.snoozeLengthMinutes}m, is24h=${args.is24Hour}, is24hKnown=${args.is24HourKnown}")

                // Cache for offline sync (WearMessageService reads this when plugin isn't loaded)
                WearSyncCache.write(
                    activity,
                    args.alarmsJson,
                    args.revision,
                    args.snoozeLengthMinutes,
                    args.is24Hour,
                    args.is24HourKnown,
                )

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
     * Send an alarm ring message to all connected watch nodes.
     *
     * Called from the Rust side when an alarm fires. The watch receives
     * this message via its [DataLayerListenerService] and starts its
     * own [WearRingingService] to show the ringing UI and vibrate.
     */
    @Command
    fun sendAlarmRing(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmRingRequest::class.java)
        scope.launch {
            try {
                val nodes = nodeClient.connectedNodes.await()
                if (nodes.isEmpty()) {
                    Log.d(TAG, "No connected watch nodes — skipping ring notification")
                    invoke.resolve()
                    return@launch
                }

                // Use current device time if Rust didn't provide explicit hour/minute
                val cal = java.util.Calendar.getInstance()
                val hour = args.hour ?: cal.get(java.util.Calendar.HOUR_OF_DAY)
                val minute = args.minute ?: cal.get(java.util.Calendar.MINUTE)

                val json = JSONObject().apply {
                    put("alarmId", args.alarmId)
                    put("label", args.label)
                    put("hour", hour)
                    put("minute", minute)
                    put("snoozeLengthMinutes", args.snoozeLengthMinutes)
                    put("is24Hour", args.is24Hour)
                    put("is24HourKnown", args.is24HourKnown)
                }
                val payload = json.toString().toByteArray()

                for (node in nodes) {
                    messageClient.sendMessage(node.id, MSG_PATH_ALARM_RING, payload).await()
                    Log.d(TAG, "Sent alarm ring to watch: ${node.displayName}")
                }
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send alarm ring to watch", e)
                invoke.reject("Failed to send alarm ring: ${e.message}")
            }
        }
    }

    /**
     * Send an alarm dismiss message to all connected watch nodes.
     *
     * Called from the Rust side when an alarm is dismissed on phone so
     * active watch ringing can stop immediately.
     */
    @Command
    fun sendAlarmDismiss(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmDismissRequest::class.java)
        scope.launch {
            try {
                val nodes = nodeClient.connectedNodes.await()
                if (nodes.isEmpty()) {
                    Log.d(TAG, "No connected watch nodes — skipping dismiss notification")
                    invoke.resolve()
                    return@launch
                }

                val json = JSONObject().apply {
                    put("alarmId", args.alarmId)
                }
                val payload = json.toString().toByteArray()

                for (node in nodes) {
                    messageClient.sendMessage(node.id, MSG_PATH_ALARM_DISMISS, payload).await()
                    Log.d(TAG, "Sent alarm dismiss to watch: ${node.displayName}")
                }
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send alarm dismiss to watch", e)
                invoke.reject("Failed to send alarm dismiss: ${e.message}")
            }
        }
    }

    /**
     * Send an alarm snooze message to all connected watch nodes.
     *
     * Called from the Rust side when an alarm is snoozed on phone so
     * active watch ringing can stop immediately.
     */
    @Command
    fun sendAlarmSnooze(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmSnoozeRequest::class.java)
        scope.launch {
            try {
                val nodes = nodeClient.connectedNodes.await()
                if (nodes.isEmpty()) {
                    Log.d(TAG, "No connected watch nodes — skipping snooze notification")
                    invoke.resolve()
                    return@launch
                }

                val json = JSONObject().apply {
                    put("alarmId", args.alarmId)
                    put("snoozeLengthMinutes", args.snoozeLengthMinutes)
                }
                val payload = json.toString().toByteArray()

                for (node in nodes) {
                    messageClient.sendMessage(node.id, MSG_PATH_ALARM_SNOOZE, payload).await()
                    Log.d(TAG, "Sent alarm snooze to watch: ${node.displayName}")
                }
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send alarm snooze to watch", e)
                invoke.reject("Failed to send alarm snooze: ${e.message}")
            }
        }
    }

    /**
     * Ask connected watch nodes to send their own native event log back, so it
     * can be merged into the phone's "Export event log" feature. Fire-and-forget
     * as far as the watch's actual reply goes: resolves once the request is sent
     * (or immediately if there's no node to send it to), doesn't wait for a reply
     * -- the watch's response (if any) arrives later via [WearMessageService] on
     * its own MSG_PATH_LOG_RESPONSE path and is written straight to the log
     * directory.
     *
     * Resolves with `{"connected": Boolean}` so the Rust side can tell "no watch
     * paired at all" apart from "request sent, might still be waiting on a reply"
     * -- the caller only needs to wait out its bounded window in the latter case.
     */
    @Command
    fun requestWatchLogs(invoke: Invoke) {
        scope.launch {
            try {
                val nodes = nodeClient.connectedNodes.await()
                if (nodes.isEmpty()) {
                    Log.d(TAG, "No connected watch nodes — skipping log request")
                    invoke.resolve(JSObject().apply { put("connected", false) })
                    return@launch
                }

                for (node in nodes) {
                    messageClient.sendMessage(node.id, MSG_PATH_LOG_REQUEST, ByteArray(0)).await()
                    Log.d(TAG, "Requested watch logs from ${node.displayName}")
                }
                invoke.resolve(JSObject().apply { put("connected", true) })
            } catch (e: Exception) {
                Log.e(TAG, "Failed to request watch logs", e)
                invoke.reject("Failed to request watch logs: ${e.message}")
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
    fun setWatchMessageHandler(invoke: Invoke) {
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
    fun markWatchPipelineReady(invoke: Invoke) {
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
            NativeEventLog.log(activity, TAG, "moveActivityToBack called, moveTaskToBack result=$moved")
        }
    }

    /**
     * Called by [WearMessageService] when a message arrives from the watch.
     *
     * Always enqueues onto [watchQueue] first, then immediately drains if the pipeline
     * is ready -- "immediate dispatch" is just "enqueue, then drain right away" rather
     * than a separate code path, so there is exactly one way a message ever reaches
     * Rust: through [drainQueuedMessages]. Sends the message to Rust via the [Channel]
     * registered by [set_watch_message_handler]; the Rust side receives the data
     * directly through JNI without involving the WebView.
     */
    fun onWatchMessage(path: String, data: String) {
        watchQueue.enqueue(path, data)
        if (watchPipelineReady) {
            drainQueuedMessages()
        } else {
            Log.i(TAG, "Watch pipeline not ready, queued message: path=$path")
        }
    }

    /**
     * Peeks every queued message and delivers each one to Rust in turn, committing
     * (removing) only the ones that were actually handed to the [Channel] successfully.
     *
     * Deliberately peek-then-commit-after-delivery rather than drain-then-deliver: if
     * `channel.send()` throws partway through a batch (a stale Channel reference, a JNI
     * failure, whatever), every message not yet delivered at that point must still be in
     * the queue afterwards so it's retried on the next drain, not silently lost.
     */
    private fun drainQueuedMessages() {
        if (!watchPipelineReady) return
        val channel = watchMessageChannel
        if (channel == null) {
            Log.w(TAG, "Watch pipeline ready but channel not registered yet, message(s) remain queued")
            return
        }

        val pending = watchQueue.peekAll()
        if (pending.isEmpty()) return

        Log.i(TAG, "Replaying ${pending.size} queued message(s)")
        val delivered = mutableSetOf<String>()
        try {
            for (message in pending) {
                val event = JSObject()
                event.put("path", message.path)
                event.put("data", message.data)
                channel.send(event)
                delivered.add(message.eventId)
                Log.d(TAG, "Sent watch message to Rust channel: path=${message.path}")
            }
        } finally {
            watchQueue.commit(delivered)
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
