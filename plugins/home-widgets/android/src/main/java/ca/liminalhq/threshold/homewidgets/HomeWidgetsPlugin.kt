// Android bridge receiving next-alarm snapshots from Rust and forwarding them to the widget
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.homewidgets

import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

// Every field must be nullable with a default -- a non-null default (e.g. `var alarmId: Int = 0`) rejects the JSON `null` Rust sends for "no next alarm" instead of binding it.
@InvokeArg
class WidgetSnapshotArgs {
    var alarmId: Int? = null
    var label: String? = null
    var triggerAt: Long? = null
    var is24Hour: Boolean? = null
}

@TauriPlugin
class HomeWidgetsPlugin(private val activity: android.app.Activity) : Plugin(activity) {
    @Command
    fun updateWidgetSnapshot(invoke: Invoke) {
        val args = invoke.parseArgs(WidgetSnapshotArgs::class.java)
        NextAlarmWidget.saveSnapshot(
            activity,
            WidgetSnapshot(
                alarmId = args.alarmId,
                label = args.label,
                triggerAt = args.triggerAt,
                is24Hour = args.is24Hour,
            ),
        )
        NextAlarmWidget.refreshAll(activity)
        invoke.resolve()
    }
}
