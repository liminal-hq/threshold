// Unit tests for NativeEventBus
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.nativebus

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Plain JUnit 4 tests -- no Robolectric/instrumentation, [NativeEventBus] is pure Kotlin. */
class NativeEventBusTest {

    @After
    fun tearDown() {
        // NativeEventBus is a process-wide singleton; without this, listeners registered
        // by one test would still be live (and firing) during the next one.
        NativeEventBus.resetForTests()
    }

    @Test
    fun `multiple listeners on the same topic are all invoked in registration order`() {
        val received = mutableListOf<String>()
        NativeEventBus.subscribe("topic-a") { payload -> received.add("first:$payload"); null }
        NativeEventBus.subscribe("topic-a") { payload -> received.add("second:$payload"); null }

        NativeEventBus.publish("topic-a", "hello")

        assertEquals(listOf("first:hello", "second:hello"), received)
    }

    @Test
    fun `a throwing listener does not block delivery to other listeners`() {
        var secondListenerRan = false
        NativeEventBus.subscribe("topic-b") { throw RuntimeException("boom") }
        NativeEventBus.subscribe("topic-b") { secondListenerRan = true; null }

        NativeEventBus.publish("topic-b", "payload")

        assertTrue(secondListenerRan)
    }

    @Test
    fun `a throwing listener does not propagate its exception to the publisher`() {
        NativeEventBus.subscribe("topic-c") { throw IllegalStateException("boom") }

        // Must return normally, not throw out of publish().
        val tags = NativeEventBus.publish("topic-c", "payload")

        assertTrue(tags.isEmpty())
    }

    @Test
    fun `tags returned by multiple listeners are collected into one set`() {
        NativeEventBus.subscribe("topic-d") { "tag-one" }
        NativeEventBus.subscribe("topic-d") { "tag-two" }
        NativeEventBus.subscribe("topic-d") { null }

        val tags = NativeEventBus.publish("topic-d", "payload")

        assertEquals(setOf("tag-one", "tag-two"), tags)
    }

    @Test
    fun `duplicate tags from different listeners collapse into one entry`() {
        NativeEventBus.subscribe("topic-e") { "same-tag" }
        NativeEventBus.subscribe("topic-e") { "same-tag" }

        val tags = NativeEventBus.publish("topic-e", "payload")

        assertEquals(setOf("same-tag"), tags)
    }

    @Test
    fun `publishing to a topic with no listeners returns an empty set without error`() {
        val tags = NativeEventBus.publish("nobody-subscribed-to-this-topic", "payload")

        assertTrue(tags.isEmpty())
    }

    @Test
    fun `concurrent subscribe and publish does not lose or corrupt listener registrations`() {
        val topic = "topic-concurrent"
        val listenerCount = 50
        val invocations = AtomicInteger(0)
        val executor = Executors.newFixedThreadPool(8)

        try {
            val registered = CountDownLatch(listenerCount)
            val subscribeTasks = (0 until listenerCount).map {
                executor.submit {
                    NativeEventBus.subscribe(topic) { invocations.incrementAndGet(); null }
                    registered.countDown()
                }
            }
            subscribeTasks.forEach { it.get(5, TimeUnit.SECONDS) }
            assertTrue(registered.await(5, TimeUnit.SECONDS))

            NativeEventBus.publish(topic, "payload")

            assertEquals(listenerCount, invocations.get())
        } finally {
            executor.shutdownNow()
        }
    }
}
