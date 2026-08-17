// Renders the next-alarm home-screen widget from its persisted snapshot, no Rust required
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.homewidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.app.PendingIntent
import android.text.format.DateFormat
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONObject

/** Which pre-built layout a given widget instance's current size should use. */
enum class WidgetLayoutBucket { HERO, NARROW }

// Below this the 4x2 hero layout's 40sp time no longer fits without clipping; the narrow
// layout (rail + time only) takes over. Matches the narrow variant's declared minWidth.
private const val NARROW_LAYOUT_THRESHOLD_DP = 180

fun selectWidgetLayoutBucket(minWidthDp: Int): WidgetLayoutBucket {
    return if (minWidthDp < NARROW_LAYOUT_THRESHOLD_DP) WidgetLayoutBucket.NARROW else WidgetLayoutBucket.HERO
}

// "h:mm a" over Java's default locale-sensitive AM/PM symbols so the rendered string always
// matches the design's "7:14 AM" shape (no locale-dependent "a.m." lowercase/period variants).
private val TIME_FORMAT_12H = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
private val TIME_FORMAT_24H = DateTimeFormatter.ofPattern("HH:mm", Locale.US)

fun formatWidgetTime(triggerAtMillis: Long, is24Hour: Boolean, zoneId: ZoneId): String {
    val zoned = Instant.ofEpochMilli(triggerAtMillis).atZone(zoneId)
    val formatter = if (is24Hour) TIME_FORMAT_24H else TIME_FORMAT_12H
    return formatter.format(zoned)
}

/** The widget's own copy of the last next-alarm snapshot Rust reported, all fields nullable. */
data class WidgetSnapshot(
    val alarmId: Int?,
    val label: String?,
    val triggerAt: Long?,
    val is24Hour: Boolean?,
)

private val EMPTY_SNAPSHOT = WidgetSnapshot(alarmId = null, label = null, triggerAt = null, is24Hour = null)

object NextAlarmWidget {
    private const val TAG = "NextAlarmWidget"
    private const val PREFS_NAME = "ThresholdWidget"
    private const val KEY_NEXT_ALARM = "next_alarm"

    // AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH default when a host hasn't reported options
    // yet -- matches the hero layout's own declared minWidth, so an unreported size renders hero.
    private const val DEFAULT_MIN_WIDTH_DP = 250

    private const val REQUEST_CODE_EMPTY_STATE = 0

    fun saveSnapshot(context: Context, snapshot: WidgetSnapshot) {
        val json = JSONObject()
        json.put("alarmId", snapshot.alarmId ?: JSONObject.NULL)
        json.put("label", snapshot.label ?: JSONObject.NULL)
        json.put("triggerAt", snapshot.triggerAt ?: JSONObject.NULL)
        json.put("is24Hour", snapshot.is24Hour ?: JSONObject.NULL)
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_NEXT_ALARM, json.toString())
            .apply()
    }

    fun loadSnapshot(context: Context): WidgetSnapshot {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_NEXT_ALARM, null) ?: return EMPTY_SNAPSHOT

        return try {
            val json = JSONObject(raw)
            WidgetSnapshot(
                alarmId = if (json.isNull("alarmId")) null else json.optInt("alarmId"),
                label = if (json.isNull("label")) null else json.optString("label"),
                triggerAt = if (json.isNull("triggerAt")) null else json.optLong("triggerAt"),
                is24Hour = if (json.isNull("is24Hour")) null else json.optBoolean("is24Hour"),
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse persisted widget snapshot, rendering empty state", e)
            EMPTY_SNAPSHOT
        }
    }

    /** Re-renders every placed instance of this widget from the persisted snapshot. */
    fun refreshAll(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, NextAlarmWidgetProvider::class.java))
        for (id in ids) {
            renderWidget(context, manager, id)
        }
    }

    /** Renders a single widget instance, sized for its own host-reported options. */
    fun renderWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val snapshot = loadSnapshot(context)
        val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
        val minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, DEFAULT_MIN_WIDTH_DP)
        val bucket = selectWidgetLayoutBucket(minWidthDp)
        appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context, snapshot, bucket))
    }

    private fun buildRemoteViews(context: Context, snapshot: WidgetSnapshot, bucket: WidgetLayoutBucket): RemoteViews {
        val layoutId = when (bucket) {
            WidgetLayoutBucket.HERO -> R.layout.widget_next_alarm
            WidgetLayoutBucket.NARROW -> R.layout.widget_next_alarm_narrow
        }
        val views = RemoteViews(context.packageName, layoutId)

        val alarmId = snapshot.alarmId
        val triggerAt = snapshot.triggerAt
        if (alarmId == null || triggerAt == null) {
            bindEmptyState(context, views)
        } else {
            bindScheduledState(context, views, alarmId, triggerAt, snapshot.label, snapshot.is24Hour)
        }

        return views
    }

    private fun bindEmptyState(context: Context, views: RemoteViews) {
        views.setTextViewText(R.id.widget_eyebrow, context.getString(R.string.widget_eyebrow))
        views.setTextViewText(R.id.widget_time, context.getString(R.string.widget_empty_state))
        views.setViewVisibility(R.id.widget_label, View.GONE)
        views.setInt(
            R.id.widget_rail,
            "setColorFilter",
            ContextCompat.getColor(context, R.color.widget_rail_muted_colour),
        )

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("threshold://home")).apply {
            setPackage(context.packageName)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            REQUEST_CODE_EMPTY_STATE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
    }

    private fun bindScheduledState(
        context: Context,
        views: RemoteViews,
        alarmId: Int,
        triggerAt: Long,
        label: String?,
        is24Hour: Boolean?,
    ) {
        // The widget process can outlive the setting that produced a stored null here (or
        // never have observed it), so fall back to the OS-wide clock-format preference rather
        // than guessing a format.
        val resolvedIs24Hour = is24Hour ?: DateFormat.is24HourFormat(context)
        val timeText = formatWidgetTime(triggerAt, resolvedIs24Hour, ZoneId.systemDefault())

        views.setTextViewText(R.id.widget_eyebrow, context.getString(R.string.widget_eyebrow))
        views.setTextViewText(R.id.widget_time, timeText)

        if (label.isNullOrBlank()) {
            views.setViewVisibility(R.id.widget_label, View.GONE)
        } else {
            views.setTextViewText(R.id.widget_label, label)
            views.setViewVisibility(R.id.widget_label, View.VISIBLE)
        }

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("threshold://edit/$alarmId")).apply {
            setPackage(context.packageName)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            alarmId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
    }
}
