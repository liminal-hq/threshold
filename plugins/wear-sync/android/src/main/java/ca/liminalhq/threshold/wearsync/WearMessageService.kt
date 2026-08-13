// WearableListenerService — routes incoming watch messages to the Rust sync pipeline
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Intent
import android.os.Build
import android.util.Log
import ca.liminalhq.threshold.nativebus.SharedPreferencesKeyValueStore
import java.io.File
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
            "Message received path=$path, pluginLoaded=${plugin != null}, channelReady=${plugin?.isChannelReady}",
        )
        if (plugin != null) {
            // Normal path: plugin is loaded, route through Tauri events
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
            PATH_ALARM_DISMISS,
            PATH_ALARM_SNOOZE -> {
                // Dismiss/snooze require the Tauri runtime to stop the ringing service.
                // Boot the app so the coordinator can process the command.
                handleOfflineWrite(path, data)
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
     * runtime and process a watch-initiated write (save or delete).
     *
     * The service shows a brief notification, boots Tauri (~1 second),
     * then replays the message through the normal plugin path.
     */
    private fun handleOfflineWrite(path: String, data: String) {
        Log.i(TAG, "Watch write received offline ($path), starting WearSyncService")
        NativeEventLog.log(applicationContext, TAG, "Offline write received path=$path, starting WearSyncService")
        WearSyncEventQueue(SharedPreferencesKeyValueStore(this, WearSyncEventQueue.PREFS_NAME)).enqueue(path, data)

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
