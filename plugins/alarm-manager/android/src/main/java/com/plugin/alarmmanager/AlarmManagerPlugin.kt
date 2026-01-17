package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import android.util.Log

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

@TauriPlugin
class AlarmManagerPlugin(private val activity: android.app.Activity) : Plugin(activity) {

    @Command
    fun schedule(invoke: Invoke) {
        val args = invoke.parseArgs(ScheduleRequest::class.java)
        Log.d("AlarmManagerPlugin", "Scheduling alarm ${args.id} at ${args.triggerAt} with sound ${args.soundUri}")

        AlarmUtils.scheduleAlarm(activity, args.id, args.triggerAt, args.soundUri)
        AlarmUtils.saveAlarmToPrefs(activity, args.id, args.triggerAt, args.soundUri)

        invoke.resolve()
    }

    @Command
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(CancelRequest::class.java)

        AlarmUtils.cancelAlarm(activity, args.id)
        AlarmUtils.removeAlarmFromPrefs(activity, args.id)

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

    @app.tauri.annotation.ActivityCallback
    fun pickAlarmSoundResult(invoke: Invoke, result: app.tauri.plugin.ActivityResult) {
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

            val ret = app.tauri.plugin.JSObject()

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
    fun get_launch_args(invoke: Invoke) {
        // Check for imported alarms from SetAlarmActivity
        val prefs = activity.getSharedPreferences("WindowAlarmImports", Context.MODE_PRIVATE)
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
                    Log.e("AlarmManagerPlugin", "Failed to parse import: $value", e)
                }
            }
        }

        val ret = app.tauri.plugin.JSObject()
        val array = app.tauri.plugin.JSArray()

        for (alarm in importsList) {
            val alarmObj = app.tauri.plugin.JSObject()
            alarmObj.put("id", alarm.id)
            alarmObj.put("hour", alarm.hour)
            alarmObj.put("minute", alarm.minute)
            alarmObj.put("label", alarm.label)
            array.put(alarmObj)
        }
        
        ret.put("imports", array)
        invoke.resolve(ret)
    }
}
