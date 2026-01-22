package com.plugin.themeutils

import android.app.Activity
import android.content.Context
import android.os.Build
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@TauriPlugin
class ThemeUtilsPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getMaterialYouColours(invoke: Invoke) {
        val result = JSObject()

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("supported", false)
            result.put("apiLevel", Build.VERSION.SDK_INT)
            result.put("palettes", JSObject())
            invoke.resolve(result)
            return
        }

        result.put("supported", true)
        result.put("apiLevel", Build.VERSION.SDK_INT)

        val context = activity.applicationContext
        val palettesObj = JSObject()

        // Helper to get colour hex
        fun getSystemColour(name: String): String? {
            try {
                val resId = context.resources.getIdentifier(name, "color", "android")
                if (resId == 0) return null
                val colourInt = context.getColor(resId)
                // Return ARGB format #AARRGGBB to preserve alpha if present
                return String.format("#%08X", colourInt)
            } catch (e: Exception) {
                Log.e("ThemeUtils", "Failed to get system colour: $name", e)
                return null
            }
        }

        val paletteNames = listOf(
            "system_accent1",
            "system_accent2",
            "system_accent3",
            "system_neutral1",
            "system_neutral2"
        )

        val tones = listOf(0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)

        for (baseName in paletteNames) {
            val paletteTones = JSObject()
            for (tone in tones) {
                val resourceName = "${baseName}_$tone"
                val hex = getSystemColour(resourceName)
                if (hex != null) {
                    paletteTones.put(tone.toString(), hex)
                }
            }
            palettesObj.put(baseName, paletteTones)
        }

        result.put("palettes", palettesObj)
        invoke.resolve(result)
    }
}
