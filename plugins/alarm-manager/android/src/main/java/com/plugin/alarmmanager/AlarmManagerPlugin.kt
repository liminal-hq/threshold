// Android alarm manager plugin bridge for scheduling, launch args, and alarm-fired callbacks
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.JSArray
import android.util.Log
import androidx.activity.result.ActivityResult
import android.content.BroadcastReceiver
import android.content.IntentFilter
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class ScheduleRequest {
    var id: Int = 0
    var triggerAt: Long = 0
    var soundUri: String? = null
}

@InvokeArg
class CancelRequest {
    var id: Int = 0
}

@InvokeArg
class PickAlarmSoundOptions {
    var existingUri: String? = null
    var title: String? = null
    var showSilent: Boolean = true
    var showDefault: Boolean = true
}

@InvokeArg
class AlarmEventHandlerArgs {
    lateinit var handler: Channel
}

@InvokeArg
class SnoozeEventHandlerArgs {
    lateinit var handler: Channel
}

@InvokeArg
class DismissEventHandlerArgs {
    lateinit var handler: Channel
}

@InvokeArg
class ImportEventHandlerArgs {
    lateinit var handler: Channel
}

@TauriPlugin
class AlarmManagerPlugin(private val activity: android.app.Activity) : Plugin(activity) {
    private var alarmEventChannel: Channel? = null
    private var snoozeEventChannel: Channel? = null
    private var dismissEventChannel: Channel? = null
    private var importEventChannel: Channel? = null
    @Volatile
    private var alarmPipelineReady: Boolean = false

    companion object {
        private const val TAG = "AlarmManagerPlugin"
        private const val CALLBACK_PREFS = "AlarmManagerCallbacks"
        private const val KEY_PENDING_ALARM_EVENTS = "pending_alarm_events"
        private const val KEY_PENDING_SNOOZE_EVENTS = "pending_snooze_events"
        private const val KEY_PENDING_DISMISS_EVENTS = "pending_dismiss_events"
        private const val KEY_PENDING_IMPORT_EVENTS = "pending_import_events"

        @Volatile
        var instance: AlarmManagerPlugin? = null
            private set

        @Synchronized
        fun notifyAlarmFired(context: Context, alarmId: Int, actualFiredAt: Long = System.currentTimeMillis()) {
            if (alarmId <= 0) return

            val plugin = instance
            if (plugin != null && plugin.dispatchAlarmFiredEvent(alarmId, actualFiredAt)) {
                Log.d(TAG, "Dispatched native alarm fired immediately: id=$alarmId")
                return
            }

            queueAlarmEvent(context, alarmId, actualFiredAt)
            Log.i(TAG, "Queued native alarm fired event (plugin/channel not ready): id=$alarmId")
        }

        @Synchronized
        fun notifySnoozeRequested(context: Context, alarmId: Int) {
            if (alarmId <= 0) return

            val plugin = instance
            if (plugin != null && plugin.dispatchSnoozeRequestedEvent(alarmId)) {
                Log.d(TAG, "Dispatched snooze requested immediately: id=$alarmId")
                return
            }

            queueSnoozeEvent(context, alarmId)
            Log.i(TAG, "Queued snooze requested event (plugin/channel not ready): id=$alarmId")
        }

        @Synchronized
        fun notifyAlarmDismissed(context: Context, alarmId: Int) {
            if (alarmId <= 0) return

            val plugin = instance
            if (plugin != null && plugin.dispatchDismissRequestedEvent(alarmId)) {
                Log.d(TAG, "Dispatched dismiss requested immediately: id=$alarmId")
                return
            }

            queueDismissEvent(context, alarmId)
            Log.i(TAG, "Queued dismiss requested event (plugin/channel not ready): id=$alarmId")
        }

        @Synchronized
        fun notifyImportRequested(
            context: Context,
            id: Int,
            hour: Int,
            minute: Int,
            label: String,
            activeDays: List<Int>,
            triggerAt: Long,
        ) {
            if (id <= 0) return

            val plugin = instance
            if (plugin != null &&
                plugin.dispatchImportRequestedEvent(id, hour, minute, label, activeDays, triggerAt)
            ) {
                Log.d(TAG, "Dispatched import requested immediately: id=$id")
                return
            }

            queueImportEvent(context, id, hour, minute, label, activeDays, triggerAt)
            Log.i(TAG, "Queued import requested event (plugin/channel not ready): id=$id")
        }

        @Synchronized
        private fun queueAlarmEvent(context: Context, alarmId: Int, actualFiredAt: Long) {
            val prefs = context.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
            val queue = JSONArray(prefs.getString(KEY_PENDING_ALARM_EVENTS, "[]"))
            queue.put(JSONObject().apply {
                put("id", alarmId)
                put("actualFiredAt", actualFiredAt)
            })
            prefs.edit().putString(KEY_PENDING_ALARM_EVENTS, queue.toString()).apply()
            NativeEventLog.log(context, TAG, "Queued fired event id=$alarmId (queue depth=${queue.length()})")
        }

        @Synchronized
        private fun queueSnoozeEvent(context: Context, alarmId: Int) {
            val prefs = context.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
            val queue = JSONArray(prefs.getString(KEY_PENDING_SNOOZE_EVENTS, "[]"))
            queue.put(JSONObject().apply {
                put("id", alarmId)
            })
            prefs.edit().putString(KEY_PENDING_SNOOZE_EVENTS, queue.toString()).apply()
            NativeEventLog.log(context, TAG, "Queued snooze event id=$alarmId (queue depth=${queue.length()})")
        }

        @Synchronized
        private fun queueDismissEvent(context: Context, alarmId: Int) {
            val prefs = context.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
            val queue = JSONArray(prefs.getString(KEY_PENDING_DISMISS_EVENTS, "[]"))
            queue.put(JSONObject().apply {
                put("id", alarmId)
            })
            prefs.edit().putString(KEY_PENDING_DISMISS_EVENTS, queue.toString()).apply()
            NativeEventLog.log(context, TAG, "Queued dismiss event id=$alarmId (queue depth=${queue.length()})")
        }

        @Synchronized
        private fun queueImportEvent(
            context: Context,
            id: Int,
            hour: Int,
            minute: Int,
            label: String,
            activeDays: List<Int>,
            triggerAt: Long,
        ) {
            val prefs = context.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
            val queue = JSONArray(prefs.getString(KEY_PENDING_IMPORT_EVENTS, "[]"))
            queue.put(JSONObject().apply {
                put("id", id)
                put("hour", hour)
                put("minute", minute)
                put("label", label)
                put("activeDays", JSONArray(activeDays))
                put("triggerAt", triggerAt)
            })
            prefs.edit().putString(KEY_PENDING_IMPORT_EVENTS, queue.toString()).apply()
            NativeEventLog.log(context, TAG, "Queued import event id=$id (queue depth=${queue.length()})")
        }
    }

    override fun load(webView: WebView) {
        super.load(webView)
        instance = this
        Log.d(TAG, "Plugin loaded.")
        applyRingingWindowFlags(activity.intent)
        drainPendingAlarmEvents()
        drainPendingSnoozeEvents()
        drainPendingDismissEvents()
        drainPendingImportEvents()
    }

    override fun onNewIntent(intent: Intent) {
        // TauriActivity's own onNewIntent dispatches here but doesn't update the activity's
        // intent itself -- without this, activity.intent stays pinned to the stale cold-start
        // intent instead of the one carrying the alarm trigger data.
        activity.intent = intent
        applyRingingWindowFlags(intent)
    }

    // The manifest's showWhenLocked/turnScreenOn attributes alone aren't reliably honoured
    // for an activity launched via a notification's full-screen intent on every OS version --
    // set them again here as a defensive backstop so the ringing screen actually occludes the
    // keyguard instead of appearing underneath it. Scoped to the ringing deep link only, so a
    // normal app launch while the phone is locked still requires authentication as expected.
    private fun applyRingingWindowFlags(intent: Intent?) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) return
        if (intent?.data?.host == "ringing") {
            activity.setShowWhenLocked(true)
            activity.setTurnScreenOn(true)
        }
    }

    @Command
    fun schedule(invoke: Invoke) {
        val args = invoke.parseArgs(ScheduleRequest::class.java)

        // TODO: Remove this compatibility command once scheduling is fully event-driven.
        AlarmUtils.scheduleAlarm(activity, args.id, args.triggerAt, args.soundUri)
        invoke.resolve()
    }

    @Command
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(CancelRequest::class.java)

        // TODO: Remove this compatibility command once cancellation is fully event-driven.
        AlarmUtils.cancelAlarm(activity, args.id)
        invoke.resolve()
    }

    @Command
    fun pickAlarmSound(invoke: Invoke) {
        val args = invoke.parseArgs(PickAlarmSoundOptions::class.java)

        val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, args.showSilent)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, args.showDefault)
            if (args.title != null) {
                putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, args.title)
            }
            if (args.existingUri != null) {
                putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(args.existingUri))
            }
        }

        startActivityForResult(invoke, intent, "pickAlarmSoundResult")
    }

    @Command
    fun stopRinging(invoke: Invoke) {
        Log.d(TAG, "Stopping ringing service via Intent")
        val intent = Intent(activity, AlarmRingingService::class.java).apply {
            action = AlarmRingingService.ACTION_DISMISS
        }
        activity.startService(intent)
        // Every path out of the ringing screen (dismiss, snooze, silence-timeout) calls this,
        // so it's the one place to clear the keyguard-bypass flags applyRingingWindowFlags()
        // set -- otherwise they'd stay on for the rest of this Activity instance's life, and a
        // later, unrelated app open while locked could bypass the lock screen too.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            activity.setShowWhenLocked(false)
            activity.setTurnScreenOn(false)
        }
        invoke.resolve()
    }

    // Android 14+ (API 34) made USE_FULL_SCREEN_INTENT a user-revocable special permission
    // (Settings > Apps > Threshold > Special app access > "Full screen intent notifications").
    // When it's off, canUseFullScreenIntent() returns false and the OS silently downgrades the
    // ringing notification's full-screen intent to an ordinary heads-up banner instead of
    // launching the ringing Activity -- no error, no callback. Below API 34 the permission is
    // granted unconditionally by declaring it in the manifest, so there's nothing to check.
    @Command
    fun checkFullScreenIntentPermission(invoke: Invoke) {
        val granted = if (Build.VERSION.SDK_INT >= 34) {
            val notificationManager =
                activity.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            notificationManager.canUseFullScreenIntent()
        } else {
            true
        }
        val ret = JSObject()
        ret.put("granted", granted)
        invoke.resolve(ret)
    }

    @Command
    fun openFullScreenIntentSettings(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= 34) {
            val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivity(intent)
        }
        invoke.resolve()
    }

    // Android 12+ (API 31) made scheduling an exact alarm ("clock/alarm" apps) a user-revocable
    // permission too -- if revoked, AlarmManager.setAlarmClock() silently degrades to an inexact
    // window (the alarm can fire minutes late) instead of throwing. Below API 31 exact alarms
    // were unconditionally allowed, so there's nothing to check.
    @Command
    fun checkExactAlarmPermission(invoke: Invoke) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }
        val ret = JSObject()
        ret.put("granted", granted)
        invoke.resolve(ret)
    }

    @Command
    fun openExactAlarmSettings(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivity(intent)
        }
        invoke.resolve()
    }

    // Doze/App Standby can defer or throttle the alarm's native wake/ring path if the app isn't
    // exempted from battery optimization, again with nothing surfaced to the user when it
    // happens. Available on every OS version this app supports (minSdk 26), unlike the two
    // checks above.
    @Command
    fun checkBatteryOptimizationExemption(invoke: Invoke) {
        val powerManager = activity.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        val ret = JSObject()
        ret.put("granted", powerManager.isIgnoringBatteryOptimizations(activity.packageName))
        invoke.resolve(ret)
    }

    @Command
    fun openBatteryOptimizationSettings(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${activity.packageName}")
        }
        activity.startActivity(intent)
        invoke.resolve()
    }

    // Ringing-screen navigation is otherwise driven entirely by the notification's full-screen
    // intent (see DeepLinkService.ts) -- if that launch is ever missed (permission denied, OS
    // quirk, or the app is simply reopened from the home-screen icon while an alarm is still
    // ringing), there is no other signal telling the frontend an alarm is active. This exposes
    // AlarmRingingService's own in-memory state so the frontend can route there as a fallback.
    @Command
    fun getCurrentlyRingingAlarm(invoke: Invoke) {
        val ret = JSObject()
        val id = AlarmRingingService.currentlyRingingAlarmId
        ret.put("id", if (id > 0) id else null)
        invoke.resolve(ret)
    }

    @Command
    fun setAlarmEventHandler(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmEventHandlerArgs::class.java)
        alarmEventChannel = args.handler
        Log.d(TAG, "Alarm event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun setSnoozeEventHandler(invoke: Invoke) {
        val args = invoke.parseArgs(SnoozeEventHandlerArgs::class.java)
        snoozeEventChannel = args.handler
        Log.d(TAG, "Snooze event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun setDismissEventHandler(invoke: Invoke) {
        val args = invoke.parseArgs(DismissEventHandlerArgs::class.java)
        dismissEventChannel = args.handler
        Log.d(TAG, "Dismiss event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun setImportEventHandler(invoke: Invoke) {
        val args = invoke.parseArgs(ImportEventHandlerArgs::class.java)
        importEventChannel = args.handler
        Log.d(TAG, "Import event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun markAlarmPipelineReady(invoke: Invoke) {
        alarmPipelineReady = true
        Log.d(TAG, "Alarm pipeline marked ready")
        drainPendingAlarmEvents()
        drainPendingSnoozeEvents()
        drainPendingDismissEvents()
        drainPendingImportEvents()
        invoke.resolve()
    }

    @app.tauri.annotation.ActivityCallback
    fun pickAlarmSoundResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val data = result.data
            val uri: Uri? = if (data != null) {
                if (Build.VERSION.SDK_INT >= 33) {
                    data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
                }
            } else null

            val ret = JSObject()

            if (uri != null) {
                ret.put("uri", uri.toString())
                ret.put("isSilent", false)
                // Best effort title
                val ringtone = RingtoneManager.getRingtone(activity, uri)
                val title = ringtone?.getTitle(activity) ?: "Unknown"
                ret.put("title", title)
            } else {
                ret.put("uri", null)
                ret.put("isSilent", true)
                ret.put("title", "Silent")
            }

            invoke.resolve(ret)
        } else {
            invoke.reject("cancelled")
        }
    }

    private fun dispatchSnoozeRequestedEvent(alarmId: Int): Boolean {
        if (!alarmPipelineReady) return false
        val channel = snoozeEventChannel ?: return false
        return try {
            val event = JSObject().apply {
                put("id", alarmId)
            }
            channel.send(event)
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to dispatch snooze requested event", e)
            false
        }
    }

    private fun dispatchDismissRequestedEvent(alarmId: Int): Boolean {
        if (!alarmPipelineReady) return false
        val channel = dismissEventChannel ?: return false
        return try {
            val event = JSObject().apply {
                put("id", alarmId)
            }
            channel.send(event)
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to dispatch dismiss requested event", e)
            false
        }
    }

    private fun dispatchAlarmFiredEvent(alarmId: Int, actualFiredAt: Long): Boolean {
        if (!alarmPipelineReady) return false
        val channel = alarmEventChannel ?: return false
        return try {
            val event = JSObject().apply {
                put("id", alarmId)
                put("actualFiredAt", actualFiredAt)
            }
            channel.send(event)
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to dispatch native alarm fired event", e)
            false
        }
    }

    private fun dispatchImportRequestedEvent(
        id: Int,
        hour: Int,
        minute: Int,
        label: String,
        activeDays: List<Int>,
        triggerAt: Long,
    ): Boolean {
        if (!alarmPipelineReady) return false
        val channel = importEventChannel ?: return false
        return try {
            val event = JSObject().apply {
                put("id", id)
                put("hour", hour)
                put("minute", minute)
                put("label", label)
                put("activeDays", JSArray(activeDays))
                put("triggerAt", triggerAt)
            }
            channel.send(event)
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to dispatch import requested event", e)
            false
        }
    }

    @Synchronized
    private fun drainPendingAlarmEvents() {
        if (!alarmPipelineReady) return
        val channel = alarmEventChannel ?: return
        val prefs = activity.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
        val rawQueue = prefs.getString(KEY_PENDING_ALARM_EVENTS, "[]") ?: "[]"
        val queue = JSONArray(rawQueue)
        if (queue.length() == 0) return

        val remaining = JSONArray()
        for (i in 0 until queue.length()) {
            val item = queue.optJSONObject(i) ?: continue
            val id = item.optInt("id", -1)
            val actualFiredAt = item.optLong("actualFiredAt", System.currentTimeMillis())
            if (id <= 0) continue

            try {
                val event = JSObject().apply {
                    put("id", id)
                    put("actualFiredAt", actualFiredAt)
                }
                channel.send(event)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to replay queued native alarm fired event id=$id", e)
                remaining.put(item)
            }
        }

        prefs.edit().putString(KEY_PENDING_ALARM_EVENTS, remaining.toString()).apply()
        Log.i(TAG, "Replayed ${queue.length() - remaining.length()} queued native alarm fired event(s)")
        NativeEventLog.log(
            activity,
            TAG,
            "Drained fired events: replayed ${queue.length() - remaining.length()}, remaining ${remaining.length()}",
        )
    }

    @Synchronized
    private fun drainPendingSnoozeEvents() {
        if (!alarmPipelineReady) return
        val channel = snoozeEventChannel ?: return
        val prefs = activity.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
        val rawQueue = prefs.getString(KEY_PENDING_SNOOZE_EVENTS, "[]") ?: "[]"
        val queue = JSONArray(rawQueue)
        if (queue.length() == 0) return

        val remaining = JSONArray()
        for (i in 0 until queue.length()) {
            val item = queue.optJSONObject(i) ?: continue
            val id = item.optInt("id", -1)
            if (id <= 0) continue

            try {
                val event = JSObject().apply {
                    put("id", id)
                }
                channel.send(event)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to replay queued snooze requested event id=$id", e)
                remaining.put(item)
            }
        }

        prefs.edit().putString(KEY_PENDING_SNOOZE_EVENTS, remaining.toString()).apply()
        Log.i(TAG, "Replayed ${queue.length() - remaining.length()} queued snooze requested event(s)")
        NativeEventLog.log(
            activity,
            TAG,
            "Drained snooze events: replayed ${queue.length() - remaining.length()}, remaining ${remaining.length()}",
        )
    }

    @Synchronized
    private fun drainPendingDismissEvents() {
        if (!alarmPipelineReady) return
        val channel = dismissEventChannel ?: return
        val prefs = activity.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
        val rawQueue = prefs.getString(KEY_PENDING_DISMISS_EVENTS, "[]") ?: "[]"
        val queue = JSONArray(rawQueue)
        if (queue.length() == 0) return

        val remaining = JSONArray()
        for (i in 0 until queue.length()) {
            val item = queue.optJSONObject(i) ?: continue
            val id = item.optInt("id", -1)
            if (id <= 0) continue

            try {
                val event = JSObject().apply {
                    put("id", id)
                }
                channel.send(event)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to replay queued dismiss requested event id=$id", e)
                remaining.put(item)
            }
        }

        prefs.edit().putString(KEY_PENDING_DISMISS_EVENTS, remaining.toString()).apply()
        Log.i(TAG, "Replayed ${queue.length() - remaining.length()} queued dismiss requested event(s)")
        NativeEventLog.log(
            activity,
            TAG,
            "Drained dismiss events: replayed ${queue.length() - remaining.length()}, remaining ${remaining.length()}",
        )
    }

    @Synchronized
    private fun drainPendingImportEvents() {
        if (!alarmPipelineReady) return
        val channel = importEventChannel ?: return
        val prefs = activity.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
        val rawQueue = prefs.getString(KEY_PENDING_IMPORT_EVENTS, "[]") ?: "[]"
        val queue = JSONArray(rawQueue)
        if (queue.length() == 0) return

        val remaining = JSONArray()
        for (i in 0 until queue.length()) {
            val item = queue.optJSONObject(i) ?: continue
            val id = item.optInt("id", -1)
            if (id <= 0) continue

            try {
                val event = JSObject().apply {
                    put("id", id)
                    put("hour", item.optInt("hour", 0))
                    put("minute", item.optInt("minute", 0))
                    put("label", item.optString("label", ""))
                    put("activeDays", item.optJSONArray("activeDays") ?: JSONArray())
                    put("triggerAt", item.optLong("triggerAt", 0))
                }
                channel.send(event)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to replay queued import requested event id=$id", e)
                remaining.put(item)
            }
        }

        prefs.edit().putString(KEY_PENDING_IMPORT_EVENTS, remaining.toString()).apply()
        Log.i(TAG, "Replayed ${queue.length() - remaining.length()} queued import requested event(s)")
        NativeEventLog.log(
            activity,
            TAG,
            "Drained import events: replayed ${queue.length() - remaining.length()}, remaining ${remaining.length()}",
        )
    }
}
