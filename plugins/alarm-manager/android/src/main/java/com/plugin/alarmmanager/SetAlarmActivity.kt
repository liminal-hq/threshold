package com.plugin.alarmmanager

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.AlarmClock
import android.util.Log
import java.util.Calendar

class SetAlarmActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val intent = intent
        if (intent.action == AlarmClock.ACTION_SET_ALARM) {
            handleSetAlarm(intent)
        }

        finish()
    }

    private fun handleSetAlarm(intent: Intent) {
        // 1. Parse Extras
        if (!intent.hasExtra(AlarmClock.EXTRA_HOUR) || !intent.hasExtra(AlarmClock.EXTRA_MINUTES)) {
            Log.e("SetAlarmActivity", "Missing HOUR or MINUTES extra")
            return
        }

        val hour = intent.getIntExtra(AlarmClock.EXTRA_HOUR, 0)
        val minutes = intent.getIntExtra(AlarmClock.EXTRA_MINUTES, 0)
        val message = intent.getStringExtra(AlarmClock.EXTRA_MESSAGE) ?: "Alarm"
        val skipUi = intent.getBooleanExtra(AlarmClock.EXTRA_SKIP_UI, false)

        // 2. Calculate Trigger Time
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minutes)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (calendar.timeInMillis <= System.currentTimeMillis()) {
            calendar.add(Calendar.DAY_OF_YEAR, 1)
        }

        val triggerAt = calendar.timeInMillis

        // 3. Generate ID (Random for now, or timestamp based)
        val id = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()

        // 4. Schedule Native
        AlarmUtils.scheduleAlarm(this, id, triggerAt, null)
        AlarmUtils.saveAlarmToPrefs(this, id, triggerAt, null)

        // 5. Store "Launch Payload" for React to import later
        // We persist this payload in SharedPrefs distinct from the alarm schedule
        // so that when the app opens, it can read it and sync to SQLite.
        saveImportPayload(id, hour, minutes, message)

        // 6. Launch App if not skipping UI
        if (!skipUi) {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            launchIntent?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("importAlarmId", id)
            }
            if (launchIntent != null) {
                startActivity(launchIntent)
            }
        }
    }

    private fun saveImportPayload(id: Int, hour: Int, minutes: Int, label: String) {
        val prefs = getSharedPreferences("ThresholdImports", MODE_PRIVATE)
        val importString = "$hour:$minutes|$label"
        prefs.edit().putString("import_$id", importString).apply()
    }
}
