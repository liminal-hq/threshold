// BroadcastReceiver for native alarm triggers that starts phone ringing service
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import ca.liminalhq.threshold.nativebus.NativeEventBus
import org.json.JSONObject
import java.util.concurrent.Executors

class AlarmReceiver : BroadcastReceiver() {
    companion object {
        // Single background thread for all fired-alarm bookkeeping (NativeEventBus publish,
        // AlarmManagerPlugin.notifyAlarmFired's durable persist/dispatch) triggered by this
        // receiver. goAsync() only extends Android's broadcast-dispatch ANR budget when the
        // actual work genuinely runs off the main thread and pendingResult.finish() is called
        // from there once it completes -- doing the same work synchronously inside onReceive()
        // itself, even wrapped in goAsync(), provides no additional protection, since ANR
        // detection is about how long the *main thread* is blocked, not about when the
        // framework considers a broadcast "officially dispatched". A single shared executor
        // (rather than spawning a fresh thread per broadcast) avoids unbounded thread creation
        // across repeated fires -- alarms don't fire concurrently in any volume that would
        // need more than one worker, and `AlarmManagerPlugin`'s own methods are `@Synchronized`
        // regardless. This plugin has no existing coroutines dependency (unlike wear-sync's
        // `CoroutineScope(Dispatchers.IO)`), so a plain `Executor` avoids adding one just for
        // this.
        private val backgroundExecutor = Executors.newSingleThreadExecutor()
    }

    override fun onReceive(context: Context, intent: Intent) {
        // Captured synchronously here, before goAsync()/the hand-off to backgroundExecutor --
        // this must reflect the moment Android actually delivered the broadcast, not whenever
        // the worker thread happens to get around to running handleAlarmBroadcast(). If an
        // earlier broadcast or a large durable backlog is still being drained on
        // backgroundExecutor, that hand-off can lag by an arbitrary amount; letting
        // recordAndPublishFiredEvent's actualFiredAt default (System.currentTimeMillis())
        // evaluate on the worker thread would then stamp the fired event with the WORKER's
        // start time, not the broadcast's. wear-sync's NativeFiredListener / Rust's
        // alarm:fired listener use actualFiredAt for a 90-second staleness check, so a delayed
        // worker computing its own timestamp here could make a stale, backlogged broadcast look
        // artificially fresh (or vice versa) and ring the watch incorrectly.
        val actualFiredAt = System.currentTimeMillis()
        // goAsync() must be called synchronously here, on the main thread, before any hand-off --
        // it captures the current broadcast's PendingResult. The actual work happens on
        // backgroundExecutor below; pendingResult.finish() runs from that thread once it's done
        // (including on the early-return guard and any exception), which is what makes goAsync()
        // meaningful here rather than a no-op wrapper.
        val pendingResult = goAsync()
        // applicationContext, not the Context onReceive() was handed, so nothing below can end up
        // holding a reference to a shorter-lived Context across the thread hop.
        val appContext = context.applicationContext
        backgroundExecutor.execute {
            try {
                handleAlarmBroadcast(appContext, intent, actualFiredAt)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun handleAlarmBroadcast(context: Context, intent: Intent, actualFiredAt: Long) {
        Log.d("AlarmReceiver", "========== ALARM RECEIVER START ==========")
        Log.d("AlarmReceiver", "Alarm Received! Action: ${intent.action}")
        val alarmId = intent.getIntExtra("ALARM_ID", -1)
        val soundUri = intent.getStringExtra("ALARM_SOUND_URI")
        Log.d("AlarmReceiver", "Alarm ID: $alarmId, Sound URI: $soundUri")
        NativeEventLog.log(context, "AlarmReceiver", "Received alarm id=$alarmId")

        // Guard: skip alarms that were cancelled or deleted before this broadcast was processed.
        // cancelAlarm() removes the prefs entry atomically with the AlarmManager cancellation, so
        // a missing entry means the alarm is definitively gone even if the broadcast was in-flight.
        // This runs before recordAndPublishFiredEvent below (not after, despite that otherwise
        // being the very first thing done for a firing alarm) precisely because a
        // cancelled/deleted alarm must never reach wear-sync's native listener -- doing it first
        // would let the watch ring for an alarm this receiver is about to disown.
        val isLive = AlarmUtils.isAlarmLive(context, alarmId)
        if (!isLive) {
            Log.w("AlarmReceiver", "Alarm $alarmId no longer live — skipping fire (deleted/cancelled)")
            Log.d("AlarmReceiver", "========== ALARM RECEIVER END (skipped) ==========")
            NativeEventLog.log(context, "AlarmReceiver", "Skipped alarm id=$alarmId (no longer live)")
            return
        }

        // Record (durably, to Rust) and publish (to NativeEventBus, for wear-sync's fast native
        // ring) the fired event -- see recordAndPublishFiredEvent's KDoc for why persisting comes
        // first. Wrapped so a failure anywhere in this bookkeeping (e.g. a SharedPreferences write
        // failing under storage pressure) can never prevent the actual physical alarm below from
        // starting -- ringing is this app's one job, and a secondary failure here must degrade to
        // "no native fast-ring / no durable record" rather than "the phone never rings at all".
        try {
            recordAndPublishFiredEvent(alarmId, isLive, actualFiredAt) { firedPayload ->
                AlarmManagerPlugin.notifyAlarmFired(context, alarmId, firedPayload)
            }
        } catch (e: Exception) {
            Log.e(
                "AlarmReceiver",
                "Failed to record/publish fired event for alarm $alarmId; ringing proceeds regardless",
                e,
            )
        }

        // Start the foreground service for sound/notification
        // The notification's full-screen intent will launch the app with the alarm ID
        // and onNewIntent() in the plugin will handle emitting the event to the frontend
        Log.d("AlarmReceiver", "Starting AlarmRingingService...")
        val serviceIntent = Intent(context, AlarmRingingService::class.java).apply {
            putExtra("ALARM_ID", alarmId)
            putExtra("ALARM_SOUND_URI", soundUri)
        }

        // Starting a foreground service from a background thread is fine -- the requirement is
        // process state (this broadcast's outstanding goAsync() PendingResult keeps the process
        // in an elevated state, the same background-start exemption alarm-triggered broadcasts
        // already rely on elsewhere in this codebase), not which thread makes the call.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
            Log.d("AlarmReceiver", "Started foreground service (API 26+)")
        } else {
            context.startService(serviceIntent)
            Log.d("AlarmReceiver", "Started service (API < 26)")
        }

        Log.d("AlarmReceiver", "Service started. Notification will launch app via full-screen intent.")
        Log.d("AlarmReceiver", "========== ALARM RECEIVER END ==========")
        NativeEventLog.log(context, "AlarmReceiver", "Started AlarmRingingService for alarm id=$alarmId")
    }
}

/**
 * Core "alarm fired" bookkeeping, factored out of [AlarmReceiver.handleAlarmBroadcast] so its
 * one invariant that actually matters -- a non-live alarm (or an invalid id) must never reach
 * [NativeEventBus] and tell wear-sync's native listener to ring the watch -- is unit-testable
 * without a live Android framework (`goAsync()`/a real `BroadcastReceiver` dispatch need one,
 * this function does not; [isLive] is the caller's already-resolved
 * [AlarmUtils.isAlarmLive] result, a Context call done by the caller). See AlarmReceiverTest.
 *
 * Builds the shared `{id, actualFiredAt}` payload exactly once -- the one source of truth for
 * this shape (see docs/architecture/event-architecture.md's Native Event Bus section) -- and hands it to [persist]
 * (the durable, Rust-facing side; [AlarmManagerPlugin.notifyAlarmFired] in production) *before*
 * publishing the same payload on [NativeEventBus]. Durable-persist-first matters because a
 * process death between the two steps then still leaves Rust with a record that the alarm fired
 * (degraded to "no fast native ring", i.e. today's pre-Phase-3A behaviour) rather than no record
 * of the fire at all. One consequence: [persist] necessarily runs before this function knows
 * what [NativeEventBus.publish] will return, so the payload [persist] receives always carries an
 * empty `handledNatively` -- [AlarmManagerPlugin.notifyAlarmFired] cannot embed tags this
 * function hasn't collected yet. This is an accepted, disclosed trade-off of prioritising
 * durability over the (best-effort) native-ring-dedup hint for this synchronous path.
 *
 * A no-op (returns an empty set, calls neither [persist] nor the bus) when [isLive] is `false`
 * or [alarmId] isn't positive.
 */
internal fun recordAndPublishFiredEvent(
    alarmId: Int,
    isLive: Boolean,
    actualFiredAt: Long = System.currentTimeMillis(),
    persist: (JSONObject) -> Unit,
): Set<String> {
    if (!isLive || alarmId <= 0) return emptySet()
    val firedPayload = JSONObject().apply {
        put("id", alarmId)
        put("actualFiredAt", actualFiredAt)
    }
    persist(firedPayload)
    return publishAlarmFiredToBus(firedPayload)
}

/**
 * Publishes [firedPayload] (the shared `{id, actualFiredAt}` shape -- see
 * [recordAndPublishFiredEvent]) on [NativeEventBus]'s [TOPIC_FIRED] topic and returns the tags
 * any in-process listeners (e.g. wear-sync's cold-process ring handler) reported handling it
 * with -- see docs/architecture/event-architecture.md's Native Event Bus section.
 */
internal fun publishAlarmFiredToBus(firedPayload: JSONObject): Set<String> =
    NativeEventBus.publish(TOPIC_FIRED, firedPayload.toString())
