// Parses the app-theme colour palette forwarded from Rust for the next-alarm widget
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.homewidgets

import org.json.JSONException
import org.json.JSONObject

/** One resolved set of widget colours, all channels pre-parsed to opaque ARGB ints. */
data class WidgetThemePalette(
    val fill: Int,
    val stroke: Int,
    val rail: Int,
    val eyebrow: Int,
    val time: Int,
    val label: Int,
    val railMuted: Int,
    val textMuted: Int,
)

/** The light/dark palette pair carried by the core app-theme event, as forwarded through Rust's `themeJson` field. */
data class WidgetTheme(val light: WidgetThemePalette, val dark: WidgetThemePalette)

// Parses a lowercase "#rrggbb" hex colour into an opaque ARGB int. Hand-rolled rather than android.graphics.Color so this stays callable from plain JUnit tests, which run on the host JVM without the Android framework.
fun parseHexColour(value: String): Int? {
    if (value.length != 7 || value[0] != '#') {
        return null
    }
    var rgb = 0
    for (i in 1..6) {
        val char = value[i]
        val digit = Character.digit(char, 16)
        if (digit == -1 || char.isUpperCase()) {
            return null
        }
        rgb = (rgb shl 4) or digit
    }
    return (0xff shl 24) or rgb
}

private fun parsePalette(json: JSONObject): WidgetThemePalette? {
    fun colour(key: String): Int? {
        val raw = json.optString(key, "")
        return if (raw.isEmpty()) null else parseHexColour(raw)
    }

    val fill = colour("fill") ?: return null
    val stroke = colour("stroke") ?: return null
    val rail = colour("rail") ?: return null
    val eyebrow = colour("eyebrow") ?: return null
    val time = colour("time") ?: return null
    val label = colour("label") ?: return null
    val railMuted = colour("railMuted") ?: return null
    val textMuted = colour("textMuted") ?: return null

    return WidgetThemePalette(
        fill = fill,
        stroke = stroke,
        rail = rail,
        eyebrow = eyebrow,
        time = time,
        label = label,
        railMuted = railMuted,
        textMuted = textMuted,
    )
}

/** Parses the `themeJson` wire string into a [WidgetTheme], returning null on any malformed input -- a blank/null string, invalid JSON, a missing `light` or `dark` object, or a bad hex colour anywhere inside either palette. */
fun parseWidgetTheme(json: String?): WidgetTheme? {
    if (json.isNullOrBlank()) {
        return null
    }
    return try {
        val root = JSONObject(json)
        val light = parsePalette(root.getJSONObject("light")) ?: return null
        val dark = parsePalette(root.getJSONObject("dark")) ?: return null
        WidgetTheme(light = light, dark = dark)
    } catch (e: JSONException) {
        null
    }
}
