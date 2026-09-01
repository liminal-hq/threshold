// Unit tests for QueueDrainer's synchronized peek-deliver-commit sequence
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Plain JUnit 4 tests -- no Robolectric/instrumentation. Covers [QueueDrainer], factored out of
 * [WearSyncPlugin.drainQueuedMessages] specifically so it's unit-testable without a live
 * `Activity`/`Channel`/Play Services instance (PR #300 finding, on top of issue #255 Phase 4B).
 *
 * The concurrency test below drives [QueueDrainer.drain] from two real [Thread]s -- not just
 * asserting single-threaded correctness -- since the bug this fixes is specifically about two
 * *overlapping* calls, which a single-threaded test can't exercise.
 */
class QueueDrainerTest {

    private lateinit var store: InMemoryKeyValueStore
    private lateinit var queue: WearSyncEventQueue
    private lateinit var drainer: QueueDrainer

    @Before
    fun setUp() {
        store = InMemoryKeyValueStore()
        queue = WearSyncEventQueue(store)
        drainer = QueueDrainer(queue)
    }

    @Test
    fun `drain delivers every pending message exactly once, oldest first, and commits them`() {
        queue.enqueue("/threshold/save_alarm", "{\"alarmId\":1}")
        queue.enqueue("/threshold/save_alarm", "{\"alarmId\":2}")

        val delivered = mutableListOf<String>()
        drainer.drain { message -> delivered.add(message.data) }

        assertEquals(listOf("{\"alarmId\":1}", "{\"alarmId\":2}"), delivered)
        assertTrue(queue.peekAll().isEmpty())
    }

    @Test
    fun `drain on an empty queue delivers nothing`() {
        var deliveredAnything = false

        drainer.drain { deliveredAnything = true }

        assertTrue(!deliveredAnything)
    }

    @Test
    fun `two overlapping drain calls do not both deliver the same batch`() {
        // The exact race from the bug report (PR #300 finding): WearSyncPlugin.
        // drainQueuedMessages() is invoked from three independent, differently-threaded call
        // sites with no mutual exclusion between peek and commit. Without @Synchronized on
        // QueueDrainer.drain, a second overlapping call could peekAll() the same
        // not-yet-committed message this one is still delivering, and redeliver it too.
        queue.enqueue("/threshold/alarm_dismiss", "{\"alarmId\":7}")

        val deliveredEventIds = CopyOnWriteArrayList<String>()
        val firstStarted = CountDownLatch(1)
        val releaseFirst = CountDownLatch(1)

        // The first drain call deliberately blocks mid-delivery (standing in for a slow
        // channel.send()) until explicitly released, holding QueueDrainer's monitor the whole
        // time -- giving the second call every opportunity to race ahead if the synchronization
        // weren't actually in effect.
        val firstThread = Thread {
            drainer.drain { message ->
                firstStarted.countDown()
                releaseFirst.await(2, TimeUnit.SECONDS)
                deliveredEventIds.add(message.eventId)
            }
        }
        firstThread.start()
        assertTrue("first drain should have started delivering", firstStarted.await(2, TimeUnit.SECONDS))

        // Started once the first call is already inside its delivery callback but hasn't
        // committed yet -- exactly the "overlapping" window the bug describes. With the fix in
        // place this call blocks on QueueDrainer's monitor until the first call's drain()
        // returns; without it, it would run straight through and redeliver the same message.
        val secondThread = Thread {
            drainer.drain { message -> deliveredEventIds.add(message.eventId) }
        }
        secondThread.start()
        // Give the second thread a real chance to attempt (and, if unfixed, complete) its own
        // drain() call before the first is released.
        Thread.sleep(200)

        releaseFirst.countDown()
        firstThread.join(2_000)
        secondThread.join(2_000)

        // Exactly one delivery for the single queued message -- not two.
        assertEquals(1, deliveredEventIds.size)
        assertTrue(queue.peekAll().isEmpty())
    }
}
