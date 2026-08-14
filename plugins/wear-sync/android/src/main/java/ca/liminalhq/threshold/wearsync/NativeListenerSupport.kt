// Shared "dedicated IO scope + NativeEventBus subscription" boilerplate for in-process listeners
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.Context
import android.util.Log
import ca.liminalhq.threshold.nativebus.NativeEventBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * Factors out the shape [NativeFiredListener] (issue #255 Phase 3B) and [NativeStopListener]
 * (Phase 4B) were duplicating verbatim: a dedicated [CoroutineScope] for a listener's async
 * work, plus the "subscribe to a topic and log the registration" pair each listener's own
 * `register()` repeated once per topic (issue #255 Phase 4B code review). Any future
 * `NativeEventBus` listener built on this same pattern should use both helpers below rather
 * than hand-rolling either again.
 */
internal object NativeListenerSupport {

    /**
     * Builds a fresh dedicated [CoroutineScope] for a listener's async work -- never
     * [WearSyncPlugin]'s own scope, since these listeners can run (and are designed to run)
     * before any [WearSyncPlugin] instance exists.
     */
    fun ioScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

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
