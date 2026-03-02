// Foreground service for watch alarm ringing — vibration, audio, wake lock
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import ca.liminalhq.threshold.wear.presentation.RingingActivity

/**
 * Foreground service that plays the alarm sound and vibrates the watch.
 *
 * Mirrors the phone's `AlarmRingingService` but adapted for Wear OS:
 * - Shorter wake lock (5 min vs 10 min)
 * - Uses default alarm ringtone (watch speaker is small)
 * - Shows a full-screen notification that launches [RingingActivity]
 *
 * The service is started by [DataLayerListenerService] when a ring
 * message arrives from the phone, or by the local [WearAlarmReceiver]
 * when the watch fires an alarm independently.
 */
class WearRingingService : Service() {

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var currentAlarmId: Int = -1

    companion object {
        const val CHANNEL_ID = "wear_alarm_ringing"
        const val NOTIFICATION_ID = 1001
        const val ACTION_DISMISS = "ca.liminalhq.threshold.wear.ACTION_DISMISS"
        const val ACTION_SNOOZE = "ca.liminalhq.threshold.wear.ACTION_SNOOZE"
        const val EXTRA_ALARM_ID = "alarm_id"
        const val EXTRA_ALARM_LABEL = "alarm_label"
        const val EXTRA_ALARM_HOUR = "alarm_hour"
        const val EXTRA_ALARM_MINUTE = "alarm_minute"
        const val EXTRA_SNOOZE_LENGTH = "snooze_length_minutes"
        private const val TAG = "WearRingingService"

        /** Alarm ID currently ringing, or -1 if idle. Used for deduplication. */
        @Volatile
        var ringingAlarmId: Int = -1
            private set
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Threshold::WearRingingService",
        )
        wakeLock?.acquire(5 * 60 * 1000L) // 5 minutes
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        when (intent.action) {
            ACTION_DISMISS -> {
                Log.d(TAG, "Dismiss action received")
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SNOOZE -> {
                Log.d(TAG, "Snooze action received")
                stopSelf()
                return START_NOT_STICKY
            }
        }

        currentAlarmId = intent.getIntExtra(EXTRA_ALARM_ID, -1)
        ringingAlarmId = currentAlarmId
        val label = intent.getStringExtra(EXTRA_ALARM_LABEL) ?: ""
        val hour = intent.getIntExtra(EXTRA_ALARM_HOUR, 0)
        val minute = intent.getIntExtra(EXTRA_ALARM_MINUTE, 0)
        val snoozeLength = intent.getIntExtra(EXTRA_SNOOZE_LENGTH, 10)

        Log.d(TAG, "Starting ringing for alarm $currentAlarmId ($hour:$minute '$label')")

        val foregroundStarted = startForegroundNotification(hour, minute, label, snoozeLength)
        if (!foregroundStarted) {
            Log.e(TAG, "Failed to enter foreground; stopping ringing service")
            launchRingingActivity(hour, minute, label, snoozeLength)
            stopSelf(startId)
            return START_NOT_STICKY
        }
        launchRingingActivity(hour, minute, label, snoozeLength)
        playAudio()
        startVibration()

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroying")
        ringingAlarmId = -1
        stopAudio()
        stopVibration()
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
    }

    private fun launchRingingActivity(hour: Int, minute: Int, label: String, snoozeLength: Int) {
        val intent = Intent(this, RingingActivity::class.java).apply {
            putExtra(EXTRA_ALARM_ID, currentAlarmId)
            putExtra(EXTRA_ALARM_LABEL, label)
            putExtra(EXTRA_ALARM_HOUR, hour)
            putExtra(EXTRA_ALARM_MINUTE, minute)
            putExtra(EXTRA_SNOOZE_LENGTH, snoozeLength)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        try {
            startActivity(intent)
            Log.d(TAG, "Launched ringing activity")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch ringing activity", e)
        }
    }

    // ── Notification ────────────────────────────────────────────────

    private fun startForegroundNotification(
        hour: Int,
        minute: Int,
        label: String,
        snoozeLength: Int,
    ): Boolean {
        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Alarm Ringing",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Shows when an alarm is ringing on the watch"
                setSound(null, null)
                enableVibration(false)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Full-screen intent → RingingActivity
        val fullScreenIntent = Intent(this, RingingActivity::class.java).apply {
            putExtra(EXTRA_ALARM_ID, currentAlarmId)
            putExtra(EXTRA_ALARM_LABEL, label)
            putExtra(EXTRA_ALARM_HOUR, hour)
            putExtra(EXTRA_ALARM_MINUTE, minute)
            putExtra(EXTRA_SNOOZE_LENGTH, snoozeLength)
            this.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, currentAlarmId, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Dismiss action
        val dismissIntent = Intent(this, WearRingingService::class.java).apply {
            action = ACTION_DISMISS
        }
        val dismissPendingIntent = PendingIntent.getService(
            this, 0, dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val timeText = "%d:%02d".format(hour, minute)
        val contentText = if (label.isNotBlank()) "$timeText — $label" else timeText

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Alarm Ringing")
            .setContentText(contentText)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setOngoing(true)
            .setContentIntent(fullScreenPendingIntent)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Dismiss",
                dismissPendingIntent,
            )
            .build()

        return try {
            startForeground(NOTIFICATION_ID, notification)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Unable to start foreground notification for ringing alarm", e)
            false
        }
    }

    // ── Audio ───────────────────────────────────────────────────────

    private fun playAudio() {
        var uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        if (uri == null) {
            Log.e(TAG, "No alarm sound URI available")
            return
        }

        try {
            mediaPlayer = MediaPlayer().apply {
                setDataSource(applicationContext, uri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play audio", e)
        }
    }

    private fun stopAudio() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping audio", e)
        }
    }

    // ── Vibration ───────────────────────────────────────────────────

    private fun startVibration() {
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val mgr = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            mgr.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (vibrator?.hasVibrator() != true) return

        // Same pattern as phone: wait 0ms, vibrate 1s, sleep 1s, repeat
        val pattern = longArrayOf(0, 1000, 1000)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 1))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(pattern, 1)
        }
    }

    private fun stopVibration() {
        try {
            vibrator?.cancel()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping vibration", e)
        }
    }
}
