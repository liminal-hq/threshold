// WearableListenerService — routes incoming watch messages to the Rust sync pipeline
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Intent
import android.os.Build
import android.util.Log
import java.io.File
import ca.liminalhq.threshold.nativebus.NativeEventBus
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private const val TAG = "WearMessageService"
private const val PATH_SYNC_REQUEST = "/threshold/sync_request"
private const val PATH_SAVE_ALARM = "/threshold/save_alarm"
private const val PATH_DELETE_ALARM = "/threshold/delete_alarm"
private const val PATH_ALARM_DISMISS = "/threshold/alarm_dismiss"
private const val PATH_ALARM_SNOOZE = "/threshold/alarm_snooze"
private const val PATH_LOG_RESPONSE = "/threshold/log_response"
private const val DATA_PATH_ALARMS = "/threshold/alarms"
private const val WATCH_LOG_FILE_NAME = "Threshold-watch.log"

// NativeEventBus topics published alongside the durable-queue enqueue below when a watch
// dismiss/snooze arrives offline (issue #255 Phase 4B) -- exact names match the Tauri event
// names `handle_watch_message` (wear-sync's src/lib.rs) already emits for these once Rust *is*
// booted (`wear:alarm:dismiss`/`wear:alarm:snooze`), so alarm-manager's own native listener
// (Phase 4A, a sibling worktree) can subscribe using the same vocabulary the rest of this
// codebase already uses for "a watch dismiss/snooze happened", and stop the phone's local
// ringing service immediately without waiting for Rust to boot and drain the durable queue.
//
// Payload key note (issue #255 Phase 4B code review): the payload published on these two
// topics is [data] verbatim -- the raw watch-originated message straight off the wire, in the
// watch's own `WearDataLayerClient.sendDismissAlarm`/`sendSnoozeAlarm` shape, which keys the
// alarm id as `"alarmId"` (that wire format predates issue #255 and isn't being changed here).
// This is *not* the same convention as alarm-manager's own `alarm-manager:dismiss-requested`/
// `snooze-requested` topics (Phase 4A, consumed by NativeStopListener in this same file's
// sibling), whose new `{id}` payload keys the alarm id as `"id"`. Don't assume the two topic
// pairs share a payload shape just because they're both native-bus dismiss/snooze signals.
internal const val TOPIC_WEAR_ALARM_DISMISS = "wear:alarm:dismiss"
internal const val TOPIC_WEAR_ALARM_SNOOZE = "wear:alarm:snooze"

/**
 * Which [NativeEventBus] topic (if any) a watch-originated message at [path] should publish
 * onto when Rust's pipeline isn't ready to act on it promptly -- `null` for every path with no
 * native listener (sync/save/delete). Factored out as a pure function of [path] alone (issue
 * #255 Phase 4B code review) so [onMessageReceived]'s "plugin loaded but pipeline not ready"
 * branch, and the offline branch's existing `busTopic` arguments, both derive the mapping from
 * one place instead of repeating the `PATH_ALARM_DISMISS`/`PATH_ALARM_SNOOZE` -> topic pairing.
 */
internal fun nativeStopBusTopic(path: String): String? = when (path) {
    PATH_ALARM_DISMISS -> TOPIC_WEAR_ALARM_DISMISS
    PATH_ALARM_SNOOZE -> TOPIC_WEAR_ALARM_SNOOZE
    else -> null
}

/**
 * Publishes [data] onto [NativeEventBus] for a watch-originated message at [path] if
 * [pipelineReady] is `false` -- the "[WearSyncPlugin] instance already loaded, but Rust's
 * pipeline isn't marked ready yet" half of the reachability fix (issue #255 Phase 4B code
 * review), factored out of [WearMessageService.onMessageReceived]'s `plugin != null` branch so
 * it's unit-testable without a live [WearableListenerService] instance, mirroring
 * [enqueueOfflineWrite]'s existing precedent for the plugin-not-loaded-at-all case.
 *
 * A no-op for [path]s with no native listener ([nativeStopBusTopic] returns `null`) or once
 * [pipelineReady] is `true` -- the normal, fully-booted case, where the message flows to Rust
 * promptly through the usual [WearSyncPlugin.onWatchMessage] channel and there's nothing left
 * for this signal to race.
 */
internal fun publishNativeStopBusIfPipelineNotReady(path: String, data: String, pipelineReady: Boolean) {
    if (pipelineReady) return
    nativeStopBusTopic(path)?.let { topic -> NativeEventBus.publish(topic, data) }
}

/**
 * Receives messages from the watch via the Wear Data Layer and routes
 * them to [WearSyncPlugin] for forwarding to the Rust sync pipeline.
 *
 * This service runs independently of the Tauri activity. When the plugin
 * is loaded, messages flow through the normal Tauri event pipeline. When
 * the plugin isn't loaded:
 *
 * - **Sync requests**: Served from [WearSyncCache] (SharedPreferences)
 * - **Save/delete commands**: Queued via [WearSyncService] (foreground
 *   service that boots the Tauri runtime)
 */
class WearMessageService : WearableListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Wear message service created")
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        val path = messageEvent.path
        val data = String(messageEvent.data, Charsets.UTF_8)
        Log.d(TAG, "Message received: path=$path, bytes=${messageEvent.data.size}")

        // Handled independent of plugin/Rust state -- this is a plain file write, not
        // routed through the Tauri event pipeline at all, so it works identically
        // whether or not Rust/webview happens to be booted right now.
        if (path == PATH_LOG_RESPONSE) {
            writeWatchLog(data)
            return
        }

        val plugin = WearSyncPlugin.instance
        NativeEventLog.log(
            applicationContext,
            TAG,
            "Message received path=$path, pluginLoaded=${plugin != null}, channelReady=${plugin?.isChannelReady}, pipelineReady=${plugin?.isPipelineReady}",
        )
        if (plugin != null) {
            // Normal path: plugin is loaded, route through Tauri events. But a loaded plugin
            // instance doesn't by itself mean Rust is ready to act on the message promptly --
            // load() sets `instance` well before Rust finishes booting, registers its own watch
            // listeners, and calls markWatchPipelineReady(). If the pipeline isn't ready yet,
            // this is the same "Rust can't act on this right now" situation the offline branch
            // below handles for dismiss/snooze via its own busTopic publish -- publish here too
            // (issue #255 Phase 4B code review), rather than silently only queueing the command
            // and leaving the native-bus stop signal (and WatchStopListener, which is registered
            // independently of plugin/Rust state -- see WearRingInitProvider) unreachable for
            // this whole startup window.
            publishNativeStopBusIfPipelineNotReady(path, data, plugin.isPipelineReady)
            when (path) {
                PATH_SYNC_REQUEST,
                PATH_SAVE_ALARM,
                PATH_DELETE_ALARM,
                PATH_ALARM_DISMISS,
                PATH_ALARM_SNOOZE -> {
                    plugin.onWatchMessage(path, data)
                }
                else -> {
                    Log.w(TAG, "Unknown message path: $path")
                }
            }
            return
        }

        // Offline path: plugin not loaded
        when (path) {
            PATH_SYNC_REQUEST -> handleOfflineSyncRequest()
            PATH_SAVE_ALARM,
            PATH_DELETE_ALARM -> handleOfflineWrite(path, data)
            PATH_ALARM_DISMISS -> {
                // Dismiss/snooze require the Tauri runtime to stop the ringing service.
                // Boot the app so the coordinator can process the command. Also publish onto
                // NativeEventBus (see busTopic's KDoc on handleOfflineWrite) so alarm-manager's
                // native listener can stop the phone's ringing service immediately, without
                // waiting for that boot.
                handleOfflineWrite(path, data, busTopic = TOPIC_WEAR_ALARM_DISMISS)
            }
            PATH_ALARM_SNOOZE -> {
                handleOfflineWrite(path, data, busTopic = TOPIC_WEAR_ALARM_SNOOZE)
            }
            else -> {
                Log.w(TAG, "Unknown message path (offline): $path")
            }
        }
    }

    /**
     * Write the watch's log content into Tauri's own `app_log_dir()`
     * (`context.filesDir.parentFile/logs`, same directory [NativeEventLog] on this
     * side writes into), so it merges into the existing "Export event log" feature
     * automatically -- no Rust involvement needed for the write itself, only for
     * triggering the original request via [WearSyncPlugin.requestWatchLogs].
     */
    private fun writeWatchLog(content: String) {
        try {
            val logsDir = File(applicationContext.filesDir.parentFile, "logs")
            if (!logsDir.exists()) {
                logsDir.mkdirs()
            }
            File(logsDir, WATCH_LOG_FILE_NAME).writeText(content)
            Log.d(TAG, "Wrote watch log (${content.length} chars) to $logsDir")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write watch log", e)
        }
    }

    /**
     * Serve a sync request from the SharedPreferences cache.
     *
     * This avoids booting the Tauri runtime for the most common offline
     * message — the watch requesting alarm data on launch.
     */
    private fun handleOfflineSyncRequest() {
        val cached = WearSyncCache.read(this)
        if (cached == null) {
            Log.i(TAG, "Sync request received but cache is empty — cannot respond offline")
            return
        }

        val (alarmsJson, revision, snoozeLengthMinutes, is24Hour, is24HourKnown) = cached
        Log.i(TAG, "Serving sync request from cache at revision $revision")

        scope.launch {
            try {
                val dataClient = Wearable.getDataClient(this@WearMessageService)
                val request = PutDataMapRequest.create(DATA_PATH_ALARMS).apply {
                    dataMap.putString("alarmsJson", alarmsJson)
                    dataMap.putLong("revision", revision)
                    dataMap.putLong("timestamp", System.currentTimeMillis())
                    dataMap.putInt("snoozeLengthMinutes", snoozeLengthMinutes)
                    dataMap.putBoolean("is24Hour", is24Hour)
                    dataMap.putBoolean("is24HourKnown", is24HourKnown)
                }
                request.setUrgent()

                val dataItem = dataClient.putDataItem(request.asPutDataRequest()).await()
                Log.d(TAG, "Published cached data to watch: uri=${dataItem.uri}, revision=$revision")
                NativeEventLog.log(applicationContext, TAG, "Served offline sync from cache at revision $revision")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to publish cached data to watch", e)
                NativeEventLog.log(applicationContext, TAG, "Failed to publish cached data to watch: ${e.message}")
            }
        }
    }

    /**
     * Start the [WearSyncService] foreground service to boot the Tauri
     * runtime and process a watch-initiated write (save, delete, dismiss, or snooze).
     *
     * The service shows a brief notification, boots Tauri (~1 second),
     * then replays the message through the normal plugin path.
     *
     * @param busTopic when non-null (dismiss/snooze only -- see the call sites in
     *   [onMessageReceived]), additionally published on [NativeEventBus] alongside the durable
     *   enqueue below, via [enqueueOfflineWrite]. `null` for save/delete, which have no native
     *   listener today and no reason to grow one -- they still need Rust to actually apply the
     *   write, unlike dismiss/snooze's "stop the local ringing service" side effect, which a
     *   native listener elsewhere in the app can act on immediately.
     */
    private fun handleOfflineWrite(path: String, data: String, busTopic: String? = null) {
        Log.i(TAG, "Watch write received offline ($path), starting WearSyncService")
        NativeEventLog.log(applicationContext, TAG, "Offline write received path=$path, starting WearSyncService")
        // Must go through the shared singleton, not a fresh instance -- see WearSyncEventQueue.getInstance's KDoc for why a second, independently-constructed instance over the same SharedPreferences file provides no mutual exclusion against WearSyncPlugin's own enqueues.
        enqueueOfflineWrite(WearSyncEventQueue.getInstance(applicationContext), path, data, busTopic)

        val serviceIntent = Intent(this, WearSyncService::class.java).apply {
            putExtra(WearSyncService.EXTRA_PATH, path)
            putExtra(WearSyncService.EXTRA_DATA, data)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        // Data Layer changes are handled by the watch side.
        // On the phone side, we only publish — we don't listen for data changes.
        Log.d(TAG, "Data changed event received (${dataEvents.count} events), ignored on phone side")
    }
}

/**
 * Core "offline watch write" bookkeeping, factored out of [WearMessageService.handleOfflineWrite]
 * so it's unit-testable without a live [android.content.Context]/[WearableListenerService]
 * instance -- mirrors [com.plugin.alarmmanager]'s `recordAndPublishFiredEvent` in spirit
 * ([queue] plays the role its `persist` callback plays there: the caller supplies the real
 * [WearSyncEventQueue] singleton, a test supplies one built over an in-memory store).
 *
 * Always enqueues onto [queue] first, unconditionally -- Rust's eventual DB catch-up still
 * needs this durable copy regardless of whether a native listener is subscribed to [busTopic]
 * right now. When [busTopic] is non-null, additionally publishes the same raw [data] on
 * [NativeEventBus] under that topic (issue #255 Phase 4B) -- the enqueue and the publish are
 * deliberately independent side effects, not a fallback for each other: the queue exists for
 * Rust's benefit, the bus publish exists for any native listener's benefit, and either one can
 * be a no-op (no native listener registered yet, or [busTopic] simply not applicable to this
 * path) without affecting the other.
 *
 * No dedup tag is threaded back from [NativeEventBus.publish]'s return value here, unlike the
 * fired path's `handled_natively` -- per the #255 design's decision 4, a double-delivered
 * *stop* signal is benign, so there's nothing for a tag to gate.
 *
 * [data] is republished onto [busTopic] byte-for-byte, unparsed -- see [TOPIC_WEAR_ALARM_DISMISS]'s
 * KDoc for the resulting payload's `"alarmId"` key, which a subscriber must not confuse with
 * alarm-manager's own `"id"`-keyed topics.
 */
internal fun enqueueOfflineWrite(queue: WearSyncEventQueue, path: String, data: String, busTopic: String?) {
    queue.enqueue(path, data)
    if (busTopic != null) {
        NativeEventBus.publish(busTopic, data)
    }
}
