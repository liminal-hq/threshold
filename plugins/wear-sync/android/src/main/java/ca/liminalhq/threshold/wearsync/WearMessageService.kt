// WearableListenerService — routes incoming watch messages to the Rust sync pipeline
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Intent
import android.os.Build
import android.util.Log
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
private const val DATA_PATH_ALARMS = "/threshold/alarms"

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

        val plugin = WearSyncPlugin.instance
        if (plugin != null) {
            // Normal path: plugin is loaded, route through Tauri events
            when (path) {
                PATH_SYNC_REQUEST,
                PATH_SAVE_ALARM,
                PATH_DELETE_ALARM -> {
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
            else -> {
                Log.w(TAG, "Unknown message path (offline): $path")
            }
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

        val (alarmsJson, revision) = cached
        Log.i(TAG, "Serving sync request from cache at revision $revision")

        scope.launch {
            try {
                val dataClient = Wearable.getDataClient(this@WearMessageService)
                val request = PutDataMapRequest.create(DATA_PATH_ALARMS).apply {
                    dataMap.putString("alarmsJson", alarmsJson)
                    dataMap.putLong("revision", revision)
                    dataMap.putLong("timestamp", System.currentTimeMillis())
                }
                request.setUrgent()

                val dataItem = dataClient.putDataItem(request.asPutDataRequest()).await()
                Log.d(TAG, "Published cached data to watch: uri=${dataItem.uri}, revision=$revision")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to publish cached data to watch", e)
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
