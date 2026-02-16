// Watch-side alarm data class with JSON parsing from Wear Data Layer payloads
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.data

import org.json.JSONObject

/**
 * Watch-side representation of an alarm.
 *
 * This is a lightweight data class that mirrors the phone-side alarm model
 * with only the fields the watch needs for display and interaction.
 */
data class WatchAlarm(
    val id: Int,
    val hour: Int,
    val minute: Int,
    val label: String,
    val enabled: Boolean,
    val daysOfWeek: List<Int> = emptyList(),
) {
    /** Formatted time string for display (e.g. "07:30"). */
    val timeDisplay: String
        get() = "%02d:%02d".format(hour, minute)

    companion object {
        fun fromJson(json: JSONObject): WatchAlarm {
            val days = if (json.has("daysOfWeek")) {
                val arr = json.getJSONArray("daysOfWeek")
                (0 until arr.length()).map { arr.getInt(it) }
            } else {
                emptyList()
            }

            return WatchAlarm(
                id = json.getInt("id"),
                hour = json.getInt("hour"),
                minute = json.getInt("minute"),
                label = json.optString("label", ""),
                enabled = json.getBoolean("enabled"),
                daysOfWeek = days,
            )
        }
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("hour", hour)
        put("minute", minute)
        put("label", label)
        put("enabled", enabled)
        put("daysOfWeek", org.json.JSONArray(daysOfWeek))
    }
}
