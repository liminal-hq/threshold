// Shared NativeEventBus subscription boilerplate, plus the per-alarm-id serial task queue in-process listeners send through
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Context
import android.util.Log
import ca.liminalhq.threshold.nativebus.NativeEventBus
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch

private const val TAG = "NativeAlarmSerialExecutor"

/**
 * Factors out the shape [NativeFiredListener] (issue #255 Phase 3B) and [NativeStopListener]
 * (Phase 4B) were duplicating verbatim: the "subscribe to a topic and log the registration"
 * pair each listener's own `register()` repeated once per topic (issue #255 Phase 4B code
 * review). Any future `NativeEventBus` listener built on this same pattern should use
 * [subscribe] rather than hand-rolling it again. Async work itself (previously each listener's
 * own dedicated [CoroutineScope], now routed through [NativeAlarmSerialExecutor] instead) is
 * covered separately below -- see its own KDoc.
 */
internal object NativeListenerSupport {

    /**
     * Subscribes [handler] to [topic] on [NativeEventBus], passing [context]'s application
     * context through (never the raw [context] itself, in case it's an `Activity` or other
     * short-lived component), and logs the registration under [tag]. See [NativeEventBus]'s
     * own KDoc for the threading contract [handler] must honour.
     */
    fun subscribe(context: Context, tag: String, topic: String, handler: (Context, String) -> String?) {
        val appContext = context.applicationContext
        NativeEventBus.subscribe(topic) { payload -> handler(appContext, payload) }
        Log.d(tag, "Registered native listener for topic '$topic'")
    }
}

/**
 * Per-alarm-id serial task queues used to keep [NativeFiredListener]'s ring send and
 * [NativeStopListener]'s dismiss/snooze send correctly ordered for the SAME alarm id (issue
 * #255 Phase 4B code review). Both listeners used to launch their actual Play Services send on
 * their own dedicated `Dispatchers.IO`-backed [CoroutineScope], independently of one another --
 * with no shared serialization, a stop send launched immediately after a fired send could be
 * scheduled onto a different `Dispatchers.IO` worker thread and complete first (during the
 * fired send's cache read, node discovery, or the Play Services call itself), so the watch
 * would see "stop" before "fired", safely no-op the early stop, then start ringing anyway once
 * "fired" finally arrives.
 *
 * A plain `CoroutineDispatcher.limitedParallelism(1)` is *not* sufficient here, despite being
 * the usual kotlinx.coroutines idiom for a serial executor: it only limits how many coroutine
 * bodies may be *actively running* on that dispatcher at once, not the order full tasks
 * complete in. A task that suspends partway through (e.g. the `await()` calls inside
 * [sendWatchMessageToConnectedNodes]) frees up its "slot" while suspended, so a second task
 * dispatched afterwards can run to completion *during* that suspension and finish first --
 * exactly the interleaving this needs to prevent, not just literal thread-parallelism.
 *
 * [submit] instead runs each alarm id's tasks through a dedicated single-consumer [Channel]:
 * offering a task ([Channel.trySend], which for an unlimited-capacity channel always succeeds
 * synchronously on the calling thread) is what actually establishes the ordering, and a single
 * background coroutine per alarm id drains the channel with `for (task in channel)`, `await`ing
 * each task's full completion -- suspension points included -- before receiving the next. As
 * long as the fired handler's [submit] call happens (in wall-clock/call order) before the stop
 * handler's -- true here, since a user can only dismiss/snooze an alarm that has already fired
 * -- the fired task is offered first and the stop task cannot start, let alone finish, ahead of
 * it, regardless of which one's send happens to suspend longer.
 *
 * Deliberately scoped per alarm id, not one queue for every alarm: unrelated alarms' native
 * sends must never block on each other just because they happen to be in flight at the same
 * time.
 *
 * Neither the channel map nor its per-id consumer coroutines are ever torn down. Alarm ids are
 * a small, bounded set (a user's actual alarms), so this is a handful of long-lived queue/
 * coroutine pairs for the life of the process, not an unbounded leak.
 */
internal object NativeAlarmSerialExecutor {

    private val queues = ConcurrentHashMap<Int, Channel<suspend () -> Unit>>()

    /**
     * Submits [block] to run for [alarmId], strictly after any block already submitted for the
     * same [alarmId] has fully finished (including its own suspension points) and strictly
     * before any block submitted for [alarmId] afterwards. Unrelated alarm ids run fully
     * independently of one another and of this call, which returns immediately without waiting
     * for [block] to run.
     */
    fun submit(alarmId: Int, block: suspend () -> Unit) {
        val channel = queues.getOrPut(alarmId) { startQueue() }
        val offered = channel.trySend(block).isSuccess
        check(offered) { "Unexpected failure offering onto an unlimited-capacity channel" }
    }

    /**
     * Starts a fresh unlimited-capacity [Channel] plus the single background coroutine that
     * drains it -- always one consumer per channel, so items are only ever processed one at a
     * time, strictly in the order [submit] offered them.
     */
    private fun startQueue(): Channel<suspend () -> Unit> {
        val channel = Channel<suspend () -> Unit>(Channel.UNLIMITED)
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            for (task in channel) {
                try {
                    task()
                } catch (e: Throwable) {
                    // Callers (NativeFiredListener/NativeStopListener) already catch their own
                    // Exceptions and log them -- this is defensive only, so one caller's bug
                    // can't cancel this coroutine and silently stop draining this alarm id's
                    // queue for the rest of the process.
                    Log.e(TAG, "Unhandled exception in a NativeAlarmSerialExecutor task", e)
                }
            }
        }
        return channel
    }
}
