package ca.liminalhq.threshold.wear.tile

import android.util.Log
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import ca.liminalhq.threshold.wear.ThresholdWearApp

private const val TAG = "NextAlarmComplication"

/**
 * Complication data source that provides the next alarm time for watch faces.
 *
 * Supports both short text (time only) and long text (time + label) formats.
 * Watch face designers can add this complication to show the next Threshold
 * alarm directly on the watch face.
 */
class NextAlarmComplicationService : ComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData? {
        return when (type) {
            ComplicationType.SHORT_TEXT -> {
                ShortTextComplicationData.Builder(
                    text = PlainComplicationText.Builder("07:30").build(),
                    contentDescription = PlainComplicationText.Builder("Next alarm: 07:30").build(),
                ).build()
            }
            ComplicationType.LONG_TEXT -> {
                LongTextComplicationData.Builder(
                    text = PlainComplicationText.Builder("07:30 — Wake up").build(),
                    contentDescription = PlainComplicationText.Builder("Next alarm: 07:30 Wake up").build(),
                ).build()
            }
            else -> null
        }
    }

    override fun onComplicationRequest(
        request: ComplicationRequest,
        listener: ComplicationRequestListener,
    ) {
        val app = application as? ThresholdWearApp
        val alarms = app?.alarmRepository?.alarms?.value ?: emptyList()

        val nextAlarm = alarms
            .filter { it.enabled }
            .minByOrNull { it.hour * 60 + it.minute }

        val data = when (request.complicationType) {
            ComplicationType.SHORT_TEXT -> {
                val text = nextAlarm?.timeDisplay ?: "--:--"
                ShortTextComplicationData.Builder(
                    text = PlainComplicationText.Builder(text).build(),
                    contentDescription = PlainComplicationText.Builder(
                        if (nextAlarm != null) "Next alarm: $text" else "No alarms"
                    ).build(),
                ).build()
            }
            ComplicationType.LONG_TEXT -> {
                val text = if (nextAlarm != null) {
                    val label = if (nextAlarm.label.isNotBlank()) " — ${nextAlarm.label}" else ""
                    "${nextAlarm.timeDisplay}$label"
                } else {
                    "No alarms"
                }
                LongTextComplicationData.Builder(
                    text = PlainComplicationText.Builder(text).build(),
                    contentDescription = PlainComplicationText.Builder(text).build(),
                ).build()
            }
            else -> {
                Log.w(TAG, "Unsupported complication type: ${request.complicationType}")
                listener.onComplicationData(null)
                return
            }
        }

        listener.onComplicationData(data)
    }
}
