// Renders the next-alarm home-screen widget from its persisted snapshot, no Rust required
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.homewidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.app.PendingIntent
import android.text.format.DateFormat
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.ceil
import org.json.JSONObject

/** Which pre-built layout a given widget instance's current size should use. */
enum class WidgetLayoutBucket { HERO, NARROW }

// Below these (scaled by the launcher's fontScale) the 4x2 hero layout's stacked eyebrow/40sp
// time/label rows no longer fit without clipping; the narrow layout (rail + time only) takes
// over. The base width bound matches the narrow variant's declared minWidth at fontScale 1.0, and
// the base height bound sits between a one-row (~40dp) and two-row (~110dp) placement since
// vertical resizing is allowed down to a single row. Both scale up with fontScale so a large
// system font setting still gets the narrow layout's larger text before it would clip in hero.
private const val NARROW_LAYOUT_WIDTH_THRESHOLD_DP = 180
private const val NARROW_LAYOUT_HEIGHT_THRESHOLD_DP = 100

fun selectWidgetLayoutBucket(minWidthDp: Int, minHeightDp: Int, fontScale: Float): WidgetLayoutBucket {
    val widthThreshold = ceil(NARROW_LAYOUT_WIDTH_THRESHOLD_DP * fontScale).toInt()
    val heightThreshold = ceil(NARROW_LAYOUT_HEIGHT_THRESHOLD_DP * fontScale).toInt()
    return if (minWidthDp < widthThreshold || minHeightDp < heightThreshold) {
        WidgetLayoutBucket.NARROW
    } else {
        WidgetLayoutBucket.HERO
    }
}

// "h:mm a" over Java's default locale-sensitive AM/PM symbols so the rendered string always matches the design's "7:14 AM" shape (no locale-dependent "a.m." lowercase/period variants).
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
    private const val KEY_WIDGET_THEME = "widget_theme"

    // AppWidgetManager option defaults when a host hasn't reported sizes yet -- both match the hero layout's own declared minimums, so an unreported size renders hero.
    private const val DEFAULT_MIN_WIDTH_DP = 250
    private const val DEFAULT_MIN_HEIGHT_DP = 110

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

    // Persists the theme JSON under its own prefs key, separate from the alarm snapshot, and only
    // when non-null -- theme: null on the wire means "not pushed yet" (the startup seed emission
    // fires before the webview loads), so a theme-less alarm update must never erase a previously
    // persisted theme.
    fun saveTheme(context: Context, themeJson: String?) {
        if (themeJson == null) {
            return
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_WIDGET_THEME, themeJson)
            .apply()
    }

    private fun loadTheme(context: Context): WidgetTheme? {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_WIDGET_THEME, null)
        return parseWidgetTheme(raw)
    }

    // The un-themed fallback palette, built from this plugin's own static day/night colour resources. Resolved from the widget-rendering Context's own configuration rather than the launcher's, so this can occasionally show the wrong day/night bucket immediately after a system theme change; in practice the un-themed window is only the interval before the app first pushes a theme.
    private fun fallbackPalette(context: Context): WidgetThemePalette {
        return WidgetThemePalette(
            fill = context.getColor(R.color.widget_card_fill),
            stroke = context.getColor(R.color.widget_card_stroke),
            rail = context.getColor(R.color.widget_rail_colour),
            eyebrow = context.getColor(R.color.widget_eyebrow_colour),
            time = context.getColor(R.color.widget_time_colour),
            label = context.getColor(R.color.widget_label_colour),
            railMuted = context.getColor(R.color.widget_rail_muted_colour),
            textMuted = context.getColor(R.color.widget_empty_text_colour),
        )
    }

    private fun resolveActivePalette(context: Context, theme: WidgetTheme?): WidgetThemePalette {
        if (theme == null) {
            return fallbackPalette(context)
        }
        val isNightMode = context.resources.configuration.uiMode and
            Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        return if (isNightMode) theme.dark else theme.light
    }

    // Applies one resolved palette to every colour-bearing view, unconditionally, on every render. This is what keeps a colour filter set on a previous render from ever going stale: the background layers, rail, and all text colours are always reassigned from the palette that matches the CURRENT theme/night state, themed or not, rather than being left alone when a theme is absent -- RemoteViews would otherwise persist an earlier filter across the next renderWidget/refreshAll call. The background is two stacked layers (stroke under a 1dp-inset fill) so the themed stroke survives tinting -- one filter over a single stroked shape would flatten both to the fill colour.
    private fun applyPalette(views: RemoteViews, palette: WidgetThemePalette, isEmptyState: Boolean) {
        views.setInt(R.id.widget_background_stroke, "setColorFilter", palette.stroke)
        views.setInt(R.id.widget_background_fill, "setColorFilter", palette.fill)
        views.setTextColor(R.id.widget_eyebrow, palette.eyebrow)
        views.setTextColor(R.id.widget_label, palette.label)
        if (isEmptyState) {
            views.setInt(R.id.widget_rail, "setColorFilter", palette.railMuted)
            views.setTextColor(R.id.widget_time, palette.textMuted)
        } else {
            views.setInt(R.id.widget_rail, "setColorFilter", palette.rail)
            views.setTextColor(R.id.widget_time, palette.time)
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
        val minHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, DEFAULT_MIN_HEIGHT_DP)
        val fontScale = context.resources.configuration.fontScale
        val bucket = selectWidgetLayoutBucket(minWidthDp, minHeightDp, fontScale)
        appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context, snapshot, bucket))
    }

    private fun buildRemoteViews(context: Context, snapshot: WidgetSnapshot, bucket: WidgetLayoutBucket): RemoteViews {
        val layoutId = when (bucket) {
            WidgetLayoutBucket.HERO -> R.layout.widget_next_alarm
            WidgetLayoutBucket.NARROW -> R.layout.widget_next_alarm_narrow
        }
        val views = RemoteViews(context.packageName, layoutId)
        val palette = resolveActivePalette(context, loadTheme(context))

        val alarmId = snapshot.alarmId
        val triggerAt = snapshot.triggerAt
        if (alarmId == null || triggerAt == null) {
            bindEmptyState(context, views, palette)
        } else {
            bindScheduledState(context, views, alarmId, triggerAt, snapshot.label, snapshot.is24Hour, palette)
        }

        return views
    }

    private fun bindEmptyState(context: Context, views: RemoteViews, palette: WidgetThemePalette) {
        views.setTextViewText(R.id.widget_eyebrow, context.getString(R.string.widget_eyebrow))
        views.setTextViewText(R.id.widget_time, context.getString(R.string.widget_empty_state))
        views.setViewVisibility(R.id.widget_label, View.GONE)
        views.setContentDescription(R.id.widget_root, context.getString(R.string.widget_cd_empty))
        applyPalette(views, palette, isEmptyState = true)

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
        palette: WidgetThemePalette,
    ) {
        // The widget process can outlive the setting that produced a stored null here (or never have observed it), so fall back to the OS-wide clock-format preference rather than guessing a format.
        val resolvedIs24Hour = is24Hour ?: DateFormat.is24HourFormat(context)
        val timeText = formatWidgetTime(triggerAt, resolvedIs24Hour, ZoneId.systemDefault())
        val hasLabel = !label.isNullOrBlank()

        views.setTextViewText(R.id.widget_eyebrow, context.getString(R.string.widget_eyebrow))
        views.setTextViewText(R.id.widget_time, timeText)

        if (hasLabel) {
            views.setTextViewText(R.id.widget_label, label)
            views.setViewVisibility(R.id.widget_label, View.VISIBLE)
        } else {
            views.setViewVisibility(R.id.widget_label, View.GONE)
        }

        val contentDescription = if (hasLabel) {
            context.getString(R.string.widget_cd_scheduled_with_label, timeText, label)
        } else {
            context.getString(R.string.widget_cd_scheduled_no_label, timeText)
        }
        views.setContentDescription(R.id.widget_root, contentDescription)
        applyPalette(views, palette, isEmptyState = false)

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
