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
            val days = when {
                json.has("daysOfWeek") -> {
                    val arr = json.getJSONArray("daysOfWeek")
                    (0 until arr.length()).map { arr.getInt(it) }
                }
                json.has("activeDays") -> {
                    val arr = json.getJSONArray("activeDays")
                    (0 until arr.length()).map { arr.getInt(it) }
                }
                else -> emptyList()
            }

            // Parse hour/minute from either explicit fields or fixedTime "HH:MM" string
            val hour: Int
            val minute: Int
            if (json.has("hour") && json.has("minute")) {
                hour = json.getInt("hour")
                minute = json.getInt("minute")
            } else if (json.has("fixedTime") && !json.isNull("fixedTime")) {
                val parts = json.getString("fixedTime").split(":")
                hour = parts.getOrNull(0)?.toIntOrNull() ?: 0
                minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
            } else if (json.has("windowStart") && !json.isNull("windowStart")) {
                val parts = json.getString("windowStart").split(":")
                hour = parts.getOrNull(0)?.toIntOrNull() ?: 0
                minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
            } else {
                hour = 0
                minute = 0
            }

            return WatchAlarm(
                id = json.getInt("id"),
                hour = hour,
                minute = minute,
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
