// Foreground service — boots Tauri runtime to process watch-initiated writes
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val TAG = "WearSyncService"

/**
 * Foreground service that boots the Tauri runtime to process watch-initiated
 * write operations (save/delete alarm) when the app isn't running.
 *
 * ## Flow
 *
 * 1. [WearMessageService] receives a save/delete message while plugin is null
 * 2. Starts this service with the message path and data as extras
 * 3. This service shows a brief "Syncing..." notification (required for fg service)
 * 4. Launches the main activity with [Intent.FLAG_ACTIVITY_NEW_TASK] to boot Tauri
 * 5. Polls [WearSyncPlugin.instance] until it becomes available (~1 second)
 * 6. Replays the watch message through the normal plugin path
 * 7. Stops itself
 *
 * ## Why a foreground service?
 *
 * - Android 12+ restricts background activity launches
 * - A foreground service with notification is the sanctioned pattern
 * - Same pattern used by `AlarmRingingService` for alarm firing
 * - The Tauri runtime boots in ~1 second (observed from logcat)
 */
class WearSyncService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "WearSyncService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        val path = intent.getStringExtra(EXTRA_PATH)
        val data = intent.getStringExtra(EXTRA_DATA)

        if (path == null || data == null) {
            Log.w(TAG, "Missing path or data extras, stopping")
            stopSelf()
            return START_NOT_STICKY
        }

        startForegroundNotification()
        bootTauriAndReplay(path, data)

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        Log.d(TAG, "WearSyncService destroyed")
    }

    private fun startForegroundNotification() {
        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Watch Sync",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Syncing alarm changes from watch"
                setSound(null, null)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle("Syncing with watch")
            .setContentText("Processing alarm change...")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    /**
     * Launch the main Tauri activity headlessly and wait for the plugin
     * to become available, then replay the watch message.
     */
    private fun bootTauriAndReplay(path: String, data: String) {
        scope.launch {
            try {
                // Launch the main activity to boot Tauri
                val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                if (launchIntent != null) {
                    launchIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    )
                    startActivity(launchIntent)
                    Log.d(TAG, "Launched main activity to boot Tauri runtime")
                } else {
                    Log.e(TAG, "Could not get launch intent for $packageName")
                    stopSelf()
                    return@launch
                }

                // Poll for plugin availability (timeout after 15 seconds)
                val maxWaitMs = 15_000L
                val pollIntervalMs = 200L
                var waited = 0L

                while (WearSyncPlugin.instance == null && waited < maxWaitMs) {
                    delay(pollIntervalMs)
                    waited += pollIntervalMs
                }

                val plugin = WearSyncPlugin.instance
                if (plugin != null) {
                    Log.i(TAG, "Plugin available after ${waited}ms, replaying message: $path")
                    plugin.onWatchMessage(path, data)
                } else {
                    Log.e(TAG, "Plugin not available after ${waited}ms, giving up on: $path")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error during Tauri boot and replay", e)
            } finally {
                stopSelf()
            }
        }
    }

    companion object {
        const val EXTRA_PATH = "wear_message_path"
        const val EXTRA_DATA = "wear_message_data"
        const val CHANNEL_ID = "wear_sync_service"
        const val NOTIFICATION_ID = 998
    }
}
