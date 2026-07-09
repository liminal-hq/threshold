// Handles the Android SET_ALARM intent to import native alarms
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.AlarmClock
import android.util.Log
import java.util.Calendar
import org.json.JSONArray
import org.json.JSONObject

// EXTRA_DAYS uses Calendar.SUNDAY(1)..SATURDAY(7); Threshold's activeDays uses 0=Sunday..6=Saturday.
// Absent/empty requestedDays means "one-time, next occurrence only" per the SET_ALARM contract --
// Threshold has no true one-shot concept (every alarm recurs on activeDays), so the honest
// translation is a single-day array for whichever weekday the resolved occurrence falls on.
// A standalone function (not a method) so it's trivially unit-testable without any Android
// framework dependency -- both parameters are already-resolved Calendar day-of-week values (1-7).
internal fun resolveActiveDays(requestedDays: List<Int>?, fallbackCalendarDay: Int): List<Int> {
    return if (requestedDays != null && requestedDays.isNotEmpty()) {
        requestedDays.map { it - 1 }
    } else {
        listOf(fallbackCalendarDay - 1)
    }
}

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

        val requestedDays = intent.getIntegerArrayListExtra(AlarmClock.EXTRA_DAYS)
        val activeDays = resolveActiveDays(requestedDays, calendar.get(Calendar.DAY_OF_WEEK))

        // 3. Generate ID (Random for now, or timestamp based)
        val id = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()

        // 4. Schedule Native (also persists to SharedPrefs for boot recovery)
        AlarmUtils.scheduleAlarm(this, id, triggerAt, null)

        // 5. Store "Launch Payload" for React to import later
        // We persist this payload in SharedPrefs distinct from the alarm schedule
        // so that when the app opens, it can read it and sync to SQLite.
        saveImportPayload(id, hour, minutes, message, activeDays, triggerAt)

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

    private fun saveImportPayload(
        id: Int,
        hour: Int,
        minutes: Int,
        label: String,
        activeDays: List<Int>,
        triggerAt: Long
    ) {
        val prefs = getSharedPreferences("ThresholdImports", MODE_PRIVATE)
        val payload = JSONObject().apply {
            put("hour", hour)
            put("minute", minutes)
            put("label", label)
            put("activeDays", JSONArray(activeDays))
            put("triggerAt", triggerAt)
        }
        prefs.edit().putString("import_$id", payload.toString()).apply()
    }
}
