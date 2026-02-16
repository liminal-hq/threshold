package com.plugin.toast

import android.app.Activity
import android.view.Gravity
import android.widget.Toast

class ToastBridge(private val activity: Activity) {
    fun show(message: String, duration: String?, position: String?) {
        val toastDuration = when (duration?.lowercase()) {
            "long" -> Toast.LENGTH_LONG
            else -> Toast.LENGTH_SHORT
        }

        activity.runOnUiThread {
            val toast = Toast.makeText(activity.applicationContext, message, toastDuration)
            when (position?.lowercase()) {
                "top" -> toast.setGravity(Gravity.TOP or Gravity.CENTER_HORIZONTAL, 0, 180)
                "centre" -> toast.setGravity(Gravity.CENTER, 0, 0)
                else -> toast.setGravity(Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL, 0, 180)
            }
            toast.show()
        }
    }
}
