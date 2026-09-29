// Native scheduling and posting of the "upcoming alarm" reminder notification with Dismiss/Snooze actions
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/**
 * The reminder notification shown roughly ten minutes before an alarm, with Dismiss and Snooze actions.
 *
 * Built and scheduled natively (rather than through the vendored `tauri-plugin-notification`) so its actions never touch an Activity or the webview: they are `PendingIntent.getBroadcast` intents aimed at [UpcomingAlarmReceiver] by component, which hands the tap to Rust through the same durable native event queue the ringing notification uses (issue #325). The vendored plugin's action buttons always launched the app via a launcher-style `getActivity` intent, which could drop the tap entirely when the app's process had been killed.
 *
 * The frontend still owns the notification's *content* (title, body, snooze label -- they depend on the 24-hour and snooze-length settings), and passes it in at schedule time; this object only stores and posts it.
 */
object UpcomingAlarmNotifier {
    const val CHANNEL_ID = "upcoming_alarm"
    const val ACTION_POST = "com.threshold.UPCOMING_POST"
    const val ACTION_DISMISS = "com.threshold.UPCOMING_DISMISS"
    const val ACTION_SNOOZE = "com.threshold.UPCOMING_SNOOZE"
    const val EXTRA_ALARM_ID = "ALARM_ID"

    // Matches the frontend's UPCOMING_NOTIFICATION_ID_OFFSET, so the JS-side best-effort cleanup of any notification the old vendored-plugin path left behind still targets the right id.
    internal const val NOTIFICATION_ID_OFFSET = 1_000_000

    private const val PREFS_NAME = "ThresholdUpcoming"
    private const val KEY_PREFIX = "upcoming_"
    private const val TAG = "UpcomingAlarmNotifier"

    /** Everything needed to post one reminder, persisted so it survives a reboot and is available to [UpcomingAlarmReceiver] at fire time. */
    internal data class Reminder(
        val alarmId: Int,
        val notifyAt: Long,
        val triggerAt: Long,
        val title: String,
        val body: String,
        val snoozeLabel: String,
    ) {
        fun toJson(): String = JSONObject().apply {
            put("alarmId", alarmId)
            put("notifyAt", notifyAt)
            put("triggerAt", triggerAt)
            put("title", title)
            put("body", body)
            put("snoozeLabel", snoozeLabel)
        }.toString()

        companion object {
            fun fromJson(raw: String): Reminder? = try {
                val json = JSONObject(raw)
                Reminder(
                    alarmId = json.getInt("alarmId"),
                    notifyAt = json.getLong("notifyAt"),
                    triggerAt = json.getLong("triggerAt"),
                    title = json.getString("title"),
                    body = json.getString("body"),
                    snoozeLabel = json.getString("snoozeLabel"),
                )
            } catch (e: Exception) {
                null
            }
        }
    }

    /** What to do with a stored [Reminder] at a given moment. */
    internal enum class Delivery { WAIT, POST_NOW, DROP }

    internal fun notificationIdFor(alarmId: Int): Int = NOTIFICATION_ID_OFFSET + alarmId

    /**
     * Decides whether a reminder should still be waited for, posted right away, or discarded. A reminder whose lead time has already passed is posted immediately as long as the alarm itself hasn't yet -- the same "send now" behaviour the frontend always had -- and dropped once the alarm's own trigger has passed too (the ringing notification has taken over by then).
     *
     * Pure so it's unit-testable on the plain host JVM, mirroring `resolveStopRingingAlarmId`.
     */
    internal fun deliveryFor(reminder: Reminder, now: Long): Delivery = when {
        reminder.notifyAt > now -> Delivery.WAIT
        reminder.triggerAt > now -> Delivery.POST_NOW
        else -> Delivery.DROP
    }

    /**
     * Stores [reminder] and arms (or replaces) its wake-up. Re-arming reuses the same `PendingIntent` key, so `AlarmManager` atomically replaces the previous registration rather than leaving a window with none (the lesson of issue #322).
     */
    internal fun schedule(context: Context, reminder: Reminder) {
        savePrefs(context, reminder)
        when (deliveryFor(reminder, System.currentTimeMillis())) {
            Delivery.WAIT -> arm(context, reminder)
            Delivery.POST_NOW -> {
                disarm(context, reminder.alarmId)
                post(context, reminder)
            }
            Delivery.DROP -> cancel(context, reminder.alarmId)
        }
        NativeEventLog.log(
            context,
            TAG,
            "Scheduled upcoming reminder for alarm id=${reminder.alarmId} notifyAt=${reminder.notifyAt} triggerAt=${reminder.triggerAt}",
        )
    }

    /** Removes any pending wake-up, stored reminder, and already-posted notification for [alarmId]. */
    fun cancel(context: Context, alarmId: Int) {
        disarm(context, alarmId)
        removePrefs(context, alarmId)
        clearNotification(context, alarmId)
    }

    /** Dismisses the posted notification only (used when one of its own actions was tapped). */
    fun clearNotification(context: Context, alarmId: Int) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(notificationIdFor(alarmId))
    }

    /** Called by [UpcomingAlarmReceiver] when a reminder's wake-up fires. */
    internal fun postStored(context: Context, alarmId: Int) {
        val reminder = loadPrefs(context, alarmId)
        if (reminder == null) {
            Log.w(TAG, "No stored reminder for alarm $alarmId -- cancelled before it fired")
            return
        }
        when (deliveryFor(reminder, System.currentTimeMillis())) {
            Delivery.DROP -> removePrefs(context, alarmId)
            else -> post(context, reminder)
        }
    }

    /** Re-arms every stored reminder after a reboot, which clears all `AlarmManager` registrations. */
    internal fun restoreAll(context: Context): Int {
        val now = System.currentTimeMillis()
        var restored = 0
        for (reminder in loadAllPrefs(context)) {
            when (deliveryFor(reminder, now)) {
                Delivery.WAIT -> { arm(context, reminder); restored++ }
                Delivery.POST_NOW -> { post(context, reminder); restored++ }
                Delivery.DROP -> removePrefs(context, reminder.alarmId)
            }
        }
        return restored
    }

    private fun post(context: Context, reminder: Reminder) {
        removePrefs(context, reminder.alarmId)

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Upcoming alarms", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Reminds you shortly before an alarm, with quick Dismiss and Snooze actions"
            }
            manager.createNotificationChannel(channel)
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(reminder.title)
            .setContentText(reminder.body)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Dismiss alarm",
                actionIntent(context, ACTION_DISMISS, reminder.alarmId),
            )
            .addAction(
                android.R.drawable.ic_popup_reminder,
                reminder.snoozeLabel,
                actionIntent(context, ACTION_SNOOZE, reminder.alarmId),
            )

        // Tapping the body opens the app, as any ordinary notification would. Only the action buttons need to avoid an Activity.
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
            builder.setContentIntent(
                PendingIntent.getActivity(
                    context,
                    reminder.alarmId,
                    launch,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
        }

        try {
            manager.notify(notificationIdFor(reminder.alarmId), builder.build())
            NativeEventLog.log(context, TAG, "Posted upcoming reminder for alarm id=${reminder.alarmId}")
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS revoked -- nothing to show, and nothing more to do.
            Log.w(TAG, "Not permitted to post upcoming reminder for alarm ${reminder.alarmId}", e)
        }
    }

    // Broadcast (never Activity) targets, addressed by explicit component so they cannot be mistaken for a launcher tap -- see the class KDoc.
    private fun actionIntent(context: Context, action: String, alarmId: Int): PendingIntent {
        val intent = Intent(context, UpcomingAlarmReceiver::class.java).apply {
            this.action = action
            putExtra(EXTRA_ALARM_ID, alarmId)
        }
        return PendingIntent.getBroadcast(
            context,
            alarmId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun wakeUpIntent(context: Context, alarmId: Int): PendingIntent {
        val intent = Intent(context, UpcomingAlarmReceiver::class.java).apply {
            action = ACTION_POST
            putExtra(EXTRA_ALARM_ID, alarmId)
        }
        return PendingIntent.getBroadcast(
            context,
            alarmId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun arm(context: Context, reminder: Reminder) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = wakeUpIntent(context, reminder.alarmId)
        // Falls back to an inexact (but still Doze-piercing) wake-up if exact alarms have been revoked -- a reminder a little late beats none, and setExactAndAllowWhileIdle would throw.
        val canBeExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
        try {
            if (canBeExact) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.notifyAt, pending)
            } else {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.notifyAt, pending)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Exact scheduling refused for alarm ${reminder.alarmId}, using inexact", e)
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.notifyAt, pending)
        }
    }

    private fun disarm(context: Context, alarmId: Int) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = wakeUpIntent(context, alarmId)
        alarmManager.cancel(pending)
        pending.cancel()
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun savePrefs(context: Context, reminder: Reminder) {
        prefs(context).edit().putString("$KEY_PREFIX${reminder.alarmId}", reminder.toJson()).apply()
    }

    private fun removePrefs(context: Context, alarmId: Int) {
        prefs(context).edit().remove("$KEY_PREFIX$alarmId").apply()
    }

    private fun loadPrefs(context: Context, alarmId: Int): Reminder? =
        prefs(context).getString("$KEY_PREFIX$alarmId", null)?.let { Reminder.fromJson(it) }

    private fun loadAllPrefs(context: Context): List<Reminder> =
        prefs(context).all.entries
            .filter { it.key.startsWith(KEY_PREFIX) }
            .mapNotNull { (it.value as? String)?.let { raw -> Reminder.fromJson(raw) } }
}
