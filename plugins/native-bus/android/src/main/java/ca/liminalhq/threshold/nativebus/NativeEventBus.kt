// Process-wide in-process pub/sub bus letting native plugin code talk to each other before Rust boots
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.nativebus

import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

private const val TAG = "NativeEventBus"

/**
 * A process-wide singleton letting different Android plugins' native code talk to each
 * other in-process -- e.g. alarm-manager telling wear-sync an alarm fired -- without
 * waiting for the Rust/WebView runtime to boot.
 *
 * ## Threading contract
 *
 * [publish] runs **synchronously, on the calling thread**. It does not post to a
 * background thread, does not call `goAsync()`, and does not spawn a coroutine of its
 * own -- a caller that needs any of that (most notably a `BroadcastReceiver`) is expected
 * to arrange it itself around the call to [publish], not rely on this bus to do it for
 * them.
 *
 * This is a deliberate design choice, and it matters concretely for the intended first
 * real caller: `AlarmReceiver.onReceive()` (wired up in a later phase of issue #255).
 * `onReceive()` runs on the main thread, and Android enforces a short ANR budget on
 * broadcast delivery. A [subscribe]d listener that blocks inside [publish] -- touching
 * disk, calling into Play Services, doing any I/O at all -- eats directly into that
 * budget on every subscriber's behalf, and can freeze or ANR the whole app. So every
 * listener registered here must honour this contract:
 *
 * - Do only cheap, non-blocking work inline: inspect `payload`, decide what to do.
 * - Hand any blocking work off to your own single-threaded executor (or coroutine scope)
 *   and return from the listener immediately -- do **not** block waiting for that work.
 * - A non-null return value (a "tag") means "accepted for async handling", not "the work
 *   is complete". [publish] only reports which listeners took ownership of the event; it
 *   says nothing about whether that work has finished.
 *
 * ## Failure isolation
 *
 * Each listener is invoked inside its own `try`/`catch`. A listener that throws is
 * logged and skipped -- it cannot prevent delivery to the other listeners registered for
 * the same topic, and the exception never propagates back to [publish]'s caller.
 */
object NativeEventBus {

    private val listenersByTopic = ConcurrentHashMap<String, CopyOnWriteArrayList<(String) -> String?>>()

    /**
     * Registers [listener] for [topic]. A topic may have any number of listeners,
     * registered from any thread; delivery order among them is registration order.
     *
     * @param listener receives the published payload and may return a non-null tag
     *   describing what it did (or is about to do asynchronously -- see the class KDoc's
     *   threading contract). Returning `null` means "no tag to report".
     */
    fun subscribe(topic: String, listener: (payload: String) -> String?) {
        listenersByTopic.computeIfAbsent(topic) { CopyOnWriteArrayList() }.add(listener)
    }

    /**
     * Synchronously invokes every listener registered for [topic], in registration
     * order, on the caller's thread. See the class KDoc for the threading contract this
     * implies for listeners, and for the failure-isolation guarantee.
     *
     * @return the set of non-null tags returned by listeners that handled the event.
     *   Empty if [topic] has no listeners, or if none of them returned a tag.
     */
    fun publish(topic: String, payload: String): Set<String> {
        val listeners = listenersByTopic[topic] ?: return emptySet()
        val tags = mutableSetOf<String>()
        for (listener in listeners) {
            try {
                listener(payload)?.let { tags.add(it) }
            } catch (e: Exception) {
                Log.w(TAG, "Listener for topic '$topic' threw, skipping it for this publish", e)
            }
        }
        return tags
    }

    /**
     * Test-only: drops every registered listener. Production code must never call this --
     * it exists so JUnit tests don't leak listener state between runs of this singleton.
     */
    fun resetForTests() {
        listenersByTopic.clear()
    }
}
