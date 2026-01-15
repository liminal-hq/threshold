package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
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
}

@InvokeArg
class CancelRequest {
    var id: Int = 0
}

@TauriPlugin
class AlarmManagerPlugin(private val activity: android.app.Activity) : Plugin(activity) {
    private val alarmManager: AlarmManager = activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    @Command
    fun schedule(invoke: Invoke) {
        val args = invoke.parseArgs(ScheduleRequest::class.java)

        Log.d("AlarmManagerPlugin", "Scheduling alarm ${args.id} at ${args.triggerAt}")

        val intent = Intent(activity, AlarmReceiver::class.java).apply {
            action = "com.windowalarm.ALARM_TRIGGER"
            putExtra("ALARM_ID", args.id)
        }

        // Use FLAG_IMMUTABLE | FLAG_UPDATE_CURRENT
        val pendingIntent = PendingIntent.getBroadcast(
            activity,
            args.id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Use setAlarmClock for maximum reliability (wakes from Doze)
        val alarmInfo = AlarmManager.AlarmClockInfo(args.triggerAt, pendingIntent)
        alarmManager.setAlarmClock(alarmInfo, pendingIntent)

        // Persist to SharedPreferences for BootReceiver restoration
        saveAlarmToPrefs(args.id, args.triggerAt)

        invoke.resolve()
    }

    @Command
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(CancelRequest::class.java)

        val intent = Intent(activity, AlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            activity,
            args.id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        alarmManager.cancel(pendingIntent)
        removeAlarmFromPrefs(args.id)

        invoke.resolve()
    }

    private fun saveAlarmToPrefs(id: Int, triggerAt: Long) {
        val prefs = activity.getSharedPreferences("WindowAlarmNative", Context.MODE_PRIVATE)
        prefs.edit().putLong("alarm_$id", triggerAt).apply()
    }

    private fun removeAlarmFromPrefs(id: Int) {
        val prefs = activity.getSharedPreferences("WindowAlarmNative", Context.MODE_PRIVATE)
        prefs.edit().remove("alarm_$id").apply()
    }
}
