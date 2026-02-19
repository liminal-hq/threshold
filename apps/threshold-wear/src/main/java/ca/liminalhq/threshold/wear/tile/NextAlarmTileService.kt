// Wear OS tile showing the next upcoming alarm time
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.tile

import android.util.Log
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.DimensionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.EventBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import ca.liminalhq.threshold.wear.ThresholdWearApp
import ca.liminalhq.threshold.wear.data.findNextUpcomingAlarm
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

private const val TAG = "NextAlarmTile"
private const val RESOURCES_VERSION = "1"

/**
 * Wear OS tile showing the next upcoming alarm.
 *
 * Displays the alarm time prominently with an optional label below it.
 * Tapping the tile opens the alarm list in [MainActivity].
 * The tile refreshes when the Data Layer delivers new alarm data.
 */
class NextAlarmTileService : TileService() {

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val app = application as? ThresholdWearApp
        val alarms = app?.alarmRepository?.alarms?.value ?: emptyList()

        val nextAlarm = findNextUpcomingAlarm(alarms)

        val layout = if (nextAlarm != null) {
            buildAlarmLayout(nextAlarm.timeDisplay, nextAlarm.label)
        } else {
            buildEmptyLayout()
        }

        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setTileTimeline(
                TimelineBuilders.Timeline.Builder()
                    .addTimelineEntry(
                        TimelineBuilders.TimelineEntry.Builder()
                            .setLayout(
                                LayoutElementBuilders.Layout.Builder()
                                    .setRoot(layout)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .build()

        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(
            ResourceBuilders.Resources.Builder()
                .setVersion(RESOURCES_VERSION)
                .build()
        )
    }

    override fun onTileEnterEvent(requestParams: EventBuilders.TileEnterEvent) {
        Log.d(TAG, "Tile entered, requesting update")
        getUpdater(this).requestUpdate(NextAlarmTileService::class.java)
    }

    private fun buildAlarmLayout(time: String, label: String): LayoutElementBuilders.LayoutElement {
        val columnBuilder = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(
                LayoutElementBuilders.Text.Builder()
                    .setText(time)
                    .setFontStyle(
                        LayoutElementBuilders.FontStyle.Builder()
                            .setSize(
                                DimensionBuilders.SpProp.Builder()
                                    .setValue(32f)
                                    .build()
                            )
                            .setWeight(LayoutElementBuilders.FONT_WEIGHT_BOLD)
                            .build()
                    )
                    .build()
            )

        if (label.isNotBlank()) {
            columnBuilder.addContent(
                LayoutElementBuilders.Text.Builder()
                    .setText(label)
                    .setFontStyle(
                        LayoutElementBuilders.FontStyle.Builder()
                            .setSize(
                                DimensionBuilders.SpProp.Builder()
                                    .setValue(14f)
                                    .build()
                            )
                            .build()
                    )
                    .setMaxLines(1)
                    .build()
            )
        }

        return LayoutElementBuilders.Box.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(
                        ModifiersBuilders.Clickable.Builder()
                            .setOnClick(
                                ActionBuilders.LaunchAction.Builder()
                                    .setAndroidActivity(
                                        ActionBuilders.AndroidActivity.Builder()
                                            .setClassName("ca.liminalhq.threshold.wear.presentation.MainActivity")
                                            .setPackageName(packageName)
                                            .build()
                                    )
                                    .build()
                            )
                            .setId("open_app")
                            .build()
                    )
                    .build()
            )
            .addContent(columnBuilder.build())
            .build()
    }

    private fun buildEmptyLayout(): LayoutElementBuilders.LayoutElement {
        return LayoutElementBuilders.Box.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(
                LayoutElementBuilders.Text.Builder()
                    .setText("No alarms")
                    .setFontStyle(
                        LayoutElementBuilders.FontStyle.Builder()
                            .setSize(
                                DimensionBuilders.SpProp.Builder()
                                    .setValue(16f)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .build()
    }
}
