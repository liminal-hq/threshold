// Monitors phone connectivity and manages fallback alarm scheduling
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.service

import android.content.Context
import android.util.Log
import ca.liminalhq.threshold.wear.data.AlarmRepository
import ca.liminalhq.threshold.wear.data.SyncStatus
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private const val TAG = "PhoneConnectionMonitor"

/** How often to poll node connectivity (ms). */
private const val POLL_INTERVAL_MS = 30_000L

/**
 * Monitors phone connectivity and toggles fallback alarm scheduling.
 *
 * When the phone is connected, local alarms are cancelled (the phone
 * sends ring messages via the Data Layer). When the phone disconnects,
 * local alarms are scheduled so the user still gets woken up.
 *
 * Uses [NodeClient.connectedNodes] polling to detect connectivity changes.
 * The Data Layer also implicitly confirms connectivity when sync data
 * arrives — [onAlarmsUpdated] should be called after each sync to
 * re-evaluate the fallback state.
 */
class PhoneConnectionMonitor(
    private val context: Context,
    private val repository: AlarmRepository,
    private val scheduler: WearAlarmScheduler,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val nodeClient by lazy { Wearable.getNodeClient(context) }

    @Volatile
    var isPhoneConnected: Boolean = false
        private set

    /**
     * Start monitoring phone connectivity.
     *
     * Performs an initial connectivity check and begins periodic polling.
     */
    fun start() {
        scope.launch {
            checkConnectivity()

            // Poll periodically for connectivity changes.
            // The Wear Data Layer doesn't provide a direct "node disconnected"
            // callback, so we poll at a reasonable interval.
            while (isActive) {
                delay(POLL_INTERVAL_MS)
                checkConnectivity()
            }
        }
    }

    /**
     * Called when alarm data arrives from the phone (sync received).
     *
     * Receiving data proves the phone is connected, so this cancels
     * any local fallback alarms and refreshes the connectivity state.
     */
    fun onAlarmsUpdated() {
        if (!isPhoneConnected) {
            Log.i(TAG, "Received sync data — phone is connected, cancelling fallback alarms")
            onConnectivityChanged(true)
        }
        // Even if already connected, reconcile in case alarm data changed
        // and local alarms are stale (shouldn't happen when connected, but safe)
        scheduler.cancelAll(repository.alarms.value)
    }

    private suspend fun checkConnectivity() {
        try {
            val nodes = nodeClient.connectedNodes.await()
            val connected = nodes.isNotEmpty()
            if (connected != isPhoneConnected) {
                Log.d(TAG, "Connectivity changed: ${nodes.size} node(s), connected=$connected")
                onConnectivityChanged(connected)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to check connectivity", e)
            // Don't change state on transient errors
        }
    }

    private fun onConnectivityChanged(connected: Boolean) {
        val wasConnected = isPhoneConnected
        isPhoneConnected = connected

        if (connected) {
            repository.setSyncStatus(SyncStatus.CONNECTED)

            if (!wasConnected) {
                Log.i(TAG, "Phone connected — cancelling local fallback alarms")
                scheduler.cancelAll(repository.alarms.value)
            }
        } else {
            repository.setSyncStatus(SyncStatus.OFFLINE)

            if (wasConnected) {
                Log.i(TAG, "Phone disconnected — scheduling local fallback alarms")
                scheduler.reconcile(repository.alarms.value)
            }
        }
    }
}
