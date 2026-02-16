// MessageClient wrapper for sending commands from watch to phone
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.NodeClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

private const val TAG = "WearDataLayerClient"
private const val PATH_SYNC_REQUEST = "/threshold/sync_request"
private const val PATH_SAVE_ALARM = "/threshold/save_alarm"
private const val PATH_DELETE_ALARM = "/threshold/delete_alarm"

/**
 * Client for sending messages from the watch to the phone via the Wear
 * Data Layer [MessageClient].
 *
 * All methods are suspend functions that should be called from a coroutine
 * scope. They find the connected phone node and send a message to it.
 */
class WearDataLayerClient(context: Context) {

    private val messageClient: MessageClient = Wearable.getMessageClient(context)
    private val nodeClient: NodeClient = Wearable.getNodeClient(context)

    /**
     * Request a sync from the phone, sending the watch's current revision
     * so the phone can determine whether to send an incremental or full sync.
     */
    suspend fun requestSync(revision: Long) {
        val payload = revision.toString().toByteArray()
        sendToPhone(PATH_SYNC_REQUEST, payload)
    }

    /**
     * Send a save/toggle command for an alarm to the phone.
     */
    suspend fun sendSaveAlarm(alarmId: Int, enabled: Boolean, watchRevision: Long) {
        val json = JSONObject().apply {
            put("alarmId", alarmId)
            put("enabled", enabled)
            put("watchRevision", watchRevision)
        }
        sendToPhone(PATH_SAVE_ALARM, json.toString().toByteArray())
    }

    /**
     * Send a delete command for an alarm to the phone.
     */
    suspend fun sendDeleteAlarm(alarmId: Int, watchRevision: Long) {
        val json = JSONObject().apply {
            put("alarmId", alarmId)
            put("watchRevision", watchRevision)
        }
        sendToPhone(PATH_DELETE_ALARM, json.toString().toByteArray())
    }

    /**
     * Check whether a phone node is currently reachable.
     */
    suspend fun isPhoneConnected(): Boolean {
        return try {
            val nodes = nodeClient.connectedNodes.await()
            nodes.isNotEmpty()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to check connected nodes", e)
            false
        }
    }

    private suspend fun sendToPhone(path: String, payload: ByteArray) {
        try {
            val nodes = nodeClient.connectedNodes.await()
            if (nodes.isEmpty()) {
                Log.w(TAG, "No connected phone node for $path")
                return
            }

            for (node in nodes) {
                messageClient.sendMessage(node.id, path, payload).await()
                Log.d(TAG, "Sent $path to ${node.displayName} (${node.id})")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send $path to phone", e)
        }
    }
}
