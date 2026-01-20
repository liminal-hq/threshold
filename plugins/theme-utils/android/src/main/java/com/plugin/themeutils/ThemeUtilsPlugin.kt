package com.plugin.themeutils

import android.app.Activity
import android.os.Build
import android.content.Context
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@TauriPlugin
class ThemeUtilsPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getMaterialYouColours(invoke: Invoke) {
        val ret = JSObject()

        if (Build.VERSION.SDK_INT >= 31) { // Build.VERSION_CODES.S is 31
            val colours = JSObject()
            val resources = activity.resources

            // Helper function to get colour hex string
            fun getHex(resId: Int): String {
                val colour = activity.getColor(resId)
                return String.format("#%06X", (0xFFFFFF and colour))
            }

            // System Accent 1
            colours.put("system_accent1_0", getHex(android.R.color.system_accent1_0))
            colours.put("system_accent1_10", getHex(android.R.color.system_accent1_10))
            colours.put("system_accent1_50", getHex(android.R.color.system_accent1_50))
            colours.put("system_accent1_100", getHex(android.R.color.system_accent1_100))
            colours.put("system_accent1_200", getHex(android.R.color.system_accent1_200))
            colours.put("system_accent1_300", getHex(android.R.color.system_accent1_300))
            colours.put("system_accent1_400", getHex(android.R.color.system_accent1_400))
            colours.put("system_accent1_500", getHex(android.R.color.system_accent1_500))
            colours.put("system_accent1_600", getHex(android.R.color.system_accent1_600))
            colours.put("system_accent1_700", getHex(android.R.color.system_accent1_700))
            colours.put("system_accent1_800", getHex(android.R.color.system_accent1_800))
            colours.put("system_accent1_900", getHex(android.R.color.system_accent1_900))
            colours.put("system_accent1_1000", getHex(android.R.color.system_accent1_1000))

            // System Accent 2
            colours.put("system_accent2_0", getHex(android.R.color.system_accent2_0))
            colours.put("system_accent2_10", getHex(android.R.color.system_accent2_10))
            colours.put("system_accent2_50", getHex(android.R.color.system_accent2_50))
            colours.put("system_accent2_100", getHex(android.R.color.system_accent2_100))
            colours.put("system_accent2_200", getHex(android.R.color.system_accent2_200))
            colours.put("system_accent2_300", getHex(android.R.color.system_accent2_300))
            colours.put("system_accent2_400", getHex(android.R.color.system_accent2_400))
            colours.put("system_accent2_500", getHex(android.R.color.system_accent2_500))
            colours.put("system_accent2_600", getHex(android.R.color.system_accent2_600))
            colours.put("system_accent2_700", getHex(android.R.color.system_accent2_700))
            colours.put("system_accent2_800", getHex(android.R.color.system_accent2_800))
            colours.put("system_accent2_900", getHex(android.R.color.system_accent2_900))
            colours.put("system_accent2_1000", getHex(android.R.color.system_accent2_1000))

            // System Accent 3
            colours.put("system_accent3_0", getHex(android.R.color.system_accent3_0))
            colours.put("system_accent3_10", getHex(android.R.color.system_accent3_10))
            colours.put("system_accent3_50", getHex(android.R.color.system_accent3_50))
            colours.put("system_accent3_100", getHex(android.R.color.system_accent3_100))
            colours.put("system_accent3_200", getHex(android.R.color.system_accent3_200))
            colours.put("system_accent3_300", getHex(android.R.color.system_accent3_300))
            colours.put("system_accent3_400", getHex(android.R.color.system_accent3_400))
            colours.put("system_accent3_500", getHex(android.R.color.system_accent3_500))
            colours.put("system_accent3_600", getHex(android.R.color.system_accent3_600))
            colours.put("system_accent3_700", getHex(android.R.color.system_accent3_700))
            colours.put("system_accent3_800", getHex(android.R.color.system_accent3_800))
            colours.put("system_accent3_900", getHex(android.R.color.system_accent3_900))
            colours.put("system_accent3_1000", getHex(android.R.color.system_accent3_1000))

            // System Neutral 1
            colours.put("system_neutral1_0", getHex(android.R.color.system_neutral1_0))
            colours.put("system_neutral1_10", getHex(android.R.color.system_neutral1_10))
            colours.put("system_neutral1_50", getHex(android.R.color.system_neutral1_50))
            colours.put("system_neutral1_100", getHex(android.R.color.system_neutral1_100))
            colours.put("system_neutral1_200", getHex(android.R.color.system_neutral1_200))
            colours.put("system_neutral1_300", getHex(android.R.color.system_neutral1_300))
            colours.put("system_neutral1_400", getHex(android.R.color.system_neutral1_400))
            colours.put("system_neutral1_500", getHex(android.R.color.system_neutral1_500))
            colours.put("system_neutral1_600", getHex(android.R.color.system_neutral1_600))
            colours.put("system_neutral1_700", getHex(android.R.color.system_neutral1_700))
            colours.put("system_neutral1_800", getHex(android.R.color.system_neutral1_800))
            colours.put("system_neutral1_900", getHex(android.R.color.system_neutral1_900))
            colours.put("system_neutral1_1000", getHex(android.R.color.system_neutral1_1000))

            // System Neutral 2
            colours.put("system_neutral2_0", getHex(android.R.color.system_neutral2_0))
            colours.put("system_neutral2_10", getHex(android.R.color.system_neutral2_10))
            colours.put("system_neutral2_50", getHex(android.R.color.system_neutral2_50))
            colours.put("system_neutral2_100", getHex(android.R.color.system_neutral2_100))
            colours.put("system_neutral2_200", getHex(android.R.color.system_neutral2_200))
            colours.put("system_neutral2_300", getHex(android.R.color.system_neutral2_300))
            colours.put("system_neutral2_400", getHex(android.R.color.system_neutral2_400))
            colours.put("system_neutral2_500", getHex(android.R.color.system_neutral2_500))
            colours.put("system_neutral2_600", getHex(android.R.color.system_neutral2_600))
            colours.put("system_neutral2_700", getHex(android.R.color.system_neutral2_700))
            colours.put("system_neutral2_800", getHex(android.R.color.system_neutral2_800))
            colours.put("system_neutral2_900", getHex(android.R.color.system_neutral2_900))
            colours.put("system_neutral2_1000", getHex(android.R.color.system_neutral2_1000))

            ret.put("colours", colours)
        } else {
            ret.put("colours", null)
        }

        invoke.resolve(ret)
    }
}
