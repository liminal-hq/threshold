// Unit tests for NativeAlarmSerialExecutor's per-alarm-id ordering guarantee
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Plain JUnit 4 tests -- no Robolectric/instrumentation, no `kotlinx-coroutines-test`. Covers
 * [NativeAlarmSerialExecutor], the fix for issue #255 Phase 4B code review's ordering bug:
 * [NativeFiredListener]'s ring send and [NativeStopListener]'s dismiss/snooze send used to run
 * on independent `Dispatchers.IO` coroutines with no ordering relationship, so a stop launched
 * immediately after a fire could race ahead of and complete before the fire's own send. These
 * tests exercise [NativeAlarmSerialExecutor.submit] directly (the seam both listeners now
 * submit through), rather than [NativeFiredListener.handle]/[NativeStopListener.handleDismiss]
 * themselves, which need a real [android.content.Context] and Play Services clients neither
 * this test source set nor its dependencies can fake -- mirrors [NativeStopListenerTest]'s and
 * [NativeFiredListenerTest]'s own "test the pure/structural seam, not the Context-requiring
 * entry point" approach.
 *
 * A completion callback (rather than a raw `List` read after the fact) is used to observe
 * ordering, so each test's final assertion only runs once every submitted task has actually
 * finished -- `submit` itself returns immediately without waiting for its block to run.
 */
class NativeAlarmSerialExecutorTest {

    @Test
    fun `a task submitted for the same alarm id cannot complete before an earlier, still-running task for that id`() = runBlocking {
        // Models the exact race from the bug report: a "fired" send is submitted first and is
        // still in flight (simulated by delay, standing in for a cache read, node discovery, or
        // the Play Services call itself) when a "stop" send for the same alarm id is submitted
        // right after it. A naive `Dispatchers.IO.limitedParallelism(1)` dispatcher does *not*
        // prevent this: it only limits concurrently *running* bodies, not the order suspended
        // tasks complete in, so "stop" could still finish first during "fired"'s delay. The
        // actual fix (a single-consumer queue per alarm id) prevents "stop" from even starting
        // until "fired" has fully finished.
        val alarmId = 7
        val order = mutableListOf<String>()
        val allDone = CompletableDeferred<Unit>()
        val firedStarted = CompletableDeferred<Unit>()

        NativeAlarmSerialExecutor.submit(alarmId) {
            firedStarted.complete(Unit)
            delay(50)
            order.add("fired")
        }
        // Wait for "fired" to have actually begun running before submitting "stop", so this
        // test reflects the real ordering (fired happens first in wall-clock time; a user can
        // only dismiss/snooze an alarm that has already fired) rather than relying on
        // submission-order luck alone.
        firedStarted.await()
        NativeAlarmSerialExecutor.submit(alarmId) {
            order.add("stop")
            allDone.complete(Unit)
        }

        allDone.await()

        assertEquals(listOf("fired", "stop"), order)
    }

    @Test
    fun `unrelated alarm ids are not serialized against each other`() = runBlocking {
        // The per-id scoping in NativeAlarmSerialExecutor exists specifically so this stays
        // true -- a slow send for one alarm must never delay a send for a different, unrelated
        // alarm.
        val order = mutableListOf<String>()
        val fastDone = CompletableDeferred<Unit>()
        val slowStarted = CompletableDeferred<Unit>()
        val slowDone = CompletableDeferred<Unit>()

        NativeAlarmSerialExecutor.submit(101) {
            slowStarted.complete(Unit)
            delay(50)
            order.add("alarm-101")
            slowDone.complete(Unit)
        }
        slowStarted.await()
        NativeAlarmSerialExecutor.submit(102) {
            order.add("alarm-102")
            fastDone.complete(Unit)
        }

        fastDone.await()
        slowDone.await()

        // The unrelated alarm's task finishes first, despite being submitted second -- it was
        // never queued behind alarm 101's still-in-flight task.
        assertEquals(listOf("alarm-102", "alarm-101"), order)
    }
}
