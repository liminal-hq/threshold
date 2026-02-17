// WearableListenerService — routes incoming watch messages to the Rust sync pipeline
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.util.Log
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

private const val TAG = "WearMessageService"
private const val PATH_SYNC_REQUEST = "/threshold/sync_request"
private const val PATH_SAVE_ALARM = "/threshold/save_alarm"
private const val PATH_DELETE_ALARM = "/threshold/delete_alarm"

/**
 * Receives messages from the watch via the Wear Data Layer and routes
 * them to [WearSyncPlugin] for forwarding to the Rust sync pipeline.
 *
 * This service runs independently of the Tauri activity and uses the
 * static [WearSyncPlugin.instance] reference to trigger Tauri events.
 */
class WearMessageService : WearableListenerService() {

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Wear message service created")
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        val path = messageEvent.path
        val data = String(messageEvent.data, Charsets.UTF_8)
        Log.d(TAG, "Message received: path=$path, bytes=${messageEvent.data.size}")

        val plugin = WearSyncPlugin.instance
        if (plugin == null) {
            Log.i(TAG, "WearSyncPlugin not yet loaded — message dropped: $path (startup sync will cover this)")
            return
        }

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
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        // Data Layer changes are handled by the watch side.
        // On the phone side, we only publish — we don't listen for data changes.
        Log.d(TAG, "Data changed event received (${dataEvents.count} events), ignored on phone side")
    }
}
