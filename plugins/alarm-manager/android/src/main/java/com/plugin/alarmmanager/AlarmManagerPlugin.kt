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
class ImportedAlarm {
    var id: Int = 0
    var hour: Int = 0
    var minute: Int = 0
    var label: String = ""
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

@TauriPlugin
class AlarmManagerPlugin(private val activity: android.app.Activity) : Plugin(activity) {
    private var alarmEventChannel: Channel? = null
    @Volatile
    private var alarmPipelineReady: Boolean = false

    companion object {
        private const val TAG = "AlarmManagerPlugin"
        private const val CALLBACK_PREFS = "AlarmManagerCallbacks"
        private const val KEY_PENDING_ALARM_EVENTS = "pending_alarm_events"

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
        private fun queueAlarmEvent(context: Context, alarmId: Int, actualFiredAt: Long) {
            val prefs = context.getSharedPreferences(CALLBACK_PREFS, Context.MODE_PRIVATE)
            val queue = JSONArray(prefs.getString(KEY_PENDING_ALARM_EVENTS, "[]"))
            queue.put(JSONObject().apply {
                put("id", alarmId)
                put("actualFiredAt", actualFiredAt)
            })
            prefs.edit().putString(KEY_PENDING_ALARM_EVENTS, queue.toString()).apply()
        }
    }
    
    override fun load(webview: WebView) {
        super.load(webview)
        instance = this
        Log.d(TAG, "Plugin loaded.")
        drainPendingAlarmEvents()
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
    fun stop_ringing(invoke: Invoke) {
        Log.d(TAG, "Stopping ringing service via Intent")
        val intent = Intent(activity, AlarmRingingService::class.java).apply {
            action = AlarmRingingService.ACTION_DISMISS
        }
        activity.startService(intent)
        invoke.resolve()
    }

    @Command
    fun set_alarm_event_handler(invoke: Invoke) {
        val args = invoke.parseArgs(AlarmEventHandlerArgs::class.java)
        alarmEventChannel = args.handler
        Log.d(TAG, "Alarm event handler channel registered")
        invoke.resolve()
    }

    @Command
    fun mark_alarm_pipeline_ready(invoke: Invoke) {
        alarmPipelineReady = true
        Log.d(TAG, "Alarm pipeline marked ready")
        drainPendingAlarmEvents()
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

    @Command
    fun check_active_alarm(invoke: Invoke) {
        val intent = activity.intent
        val isAlarm = intent?.getBooleanExtra("isAlarmTriggered", false) ?: false
        val alarmId = intent?.getIntExtra("ALARM_ID", -1) ?: -1
        
        val ret = JSObject()
        ret.put("isAlarm", isAlarm)
        if (isAlarm && alarmId != -1) {
            ret.put("alarmId", alarmId)
        } else {
             ret.put("alarmId", null)
        }
        
        // Optional: clear the intent flag so it doesn't trigger again on reload? 
        // For now, keep it simple.
        
        invoke.resolve(ret)
    }

    @Command
    fun get_launch_args(invoke: Invoke) {
        // Check for imported alarms from SetAlarmActivity
        val prefs = activity.getSharedPreferences("ThresholdImports", Context.MODE_PRIVATE)
        val allImports = prefs.all
        val importsList = mutableListOf<ImportedAlarm>()

        for ((key, value) in allImports) {
            if (key.startsWith("import_") && value is String) {
                try {
                    val id = key.removePrefix("import_").toInt()
                    val parts = value.split("|")
                    if (parts.size == 2) {
                        val timeParts = parts[0].split(":")
                        val hour = timeParts[0].toInt()
                        val minute = timeParts[1].toInt()
                        val label = parts[1]

                        val import = ImportedAlarm()
                        import.id = id
                        import.hour = hour
                        import.minute = minute
                        import.label = label
                        importsList.add(import)

                        // Clean up
                        prefs.edit().remove(key).apply()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse import: $value", e)
                }
            }
        }

        val ret = JSObject()
        val array = JSArray()

        for (alarm in importsList) {
            val alarmObj = JSObject()
            alarmObj.put("id", alarm.id)
            alarmObj.put("hour", alarm.hour)
            alarmObj.put("minute", alarm.minute)
            alarmObj.put("label", alarm.label)
            array.put(alarmObj)
        }

        ret.put("value", array)
        invoke.resolve(ret)
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
    }
}
