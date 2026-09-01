// AppWidgetProvider entry points -- pure delegation, all rendering logic lives in NextAlarmWidget
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.homewidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle

class NextAlarmWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            NextAlarmWidget.renderWidget(context, appWidgetManager, appWidgetId)
        }
    }

    // Fires when the host resizes an instance or first reports its cell size -- re-render so a drag between the hero and narrow size buckets swaps layout immediately.
    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle,
    ) {
        NextAlarmWidget.renderWidget(context, appWidgetManager, appWidgetId)
    }
}
