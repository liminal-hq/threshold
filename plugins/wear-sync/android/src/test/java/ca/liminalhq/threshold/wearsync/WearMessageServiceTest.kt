// Unit tests for WearMessageService's offline-write bus-publish bookkeeping
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import ca.liminalhq.threshold.nativebus.NativeEventBus
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Plain JUnit 4 tests against [enqueueOfflineWrite] -- the pure bookkeeping
 * [WearMessageService.handleOfflineWrite] delegates to, factored out specifically so it's
 * testable without a live [android.content.Context]/`WearableListenerService` instance.
 * Mirrors [WearSyncEventQueueTest]'s style (in-memory [InMemoryKeyValueStore], no
 * Robolectric/instrumentation).
 *
 * Covers issue #255 Phase 4B's addition: publishing onto [NativeEventBus] alongside the
 * pre-existing durable-queue enqueue for watch-originated dismiss/snooze messages, without
 * disturbing that enqueue's own behaviour.
 */
class WearMessageServiceTest {

    private lateinit var store: InMemoryKeyValueStore
    private lateinit var queue: WearSyncEventQueue

    @Before
    fun setUp() {
        store = InMemoryKeyValueStore()
        queue = WearSyncEventQueue(store)
    }

    @After
    fun tearDown() {
        // NativeEventBus is a process-wide singleton -- see NativeEventBusTest's own
        // tearDown for why this is needed between tests.
        NativeEventBus.resetForTests()
    }

    @Test
    fun `enqueues onto the durable queue exactly as before when busTopic is null`() {
        enqueueOfflineWrite(queue, "/threshold/save_alarm", "{\"alarmId\":1}", busTopic = null)

        val pending = queue.peekAll()

        assertEquals(1, pending.size)
        assertEquals("/threshold/save_alarm" to "{\"alarmId\":1}", pending.single().path to pending.single().data)
    }

    @Test
    fun `a null busTopic publishes nothing onto NativeEventBus`() {
        var published = false
        NativeEventBus.subscribe("wear:alarm:dismiss") { published = true; null }

        enqueueOfflineWrite(queue, "/threshold/save_alarm", "{\"alarmId\":1}", busTopic = null)

        assertTrue(!published)
    }

    @Test
    fun `a non-null busTopic still enqueues onto the durable queue`() {
        enqueueOfflineWrite(queue, "/threshold/alarm_dismiss", "{\"alarmId\":7}", busTopic = TOPIC_WEAR_ALARM_DISMISS)

        val pending = queue.peekAll()

        assertEquals(1, pending.size)
        assertEquals("/threshold/alarm_dismiss" to "{\"alarmId\":7}", pending.single().path to pending.single().data)
    }

    @Test
    fun `a non-null busTopic additionally publishes the raw data onto NativeEventBus`() {
        var receivedPayload: String? = null
        NativeEventBus.subscribe(TOPIC_WEAR_ALARM_DISMISS) { payload -> receivedPayload = payload; null }

        enqueueOfflineWrite(queue, "/threshold/alarm_dismiss", "{\"alarmId\":7}", busTopic = TOPIC_WEAR_ALARM_DISMISS)

        assertEquals("{\"alarmId\":7}", receivedPayload)
    }

    @Test
    fun `snooze publishes on the snooze topic, not the dismiss topic`() {
        var dismissReceived = false
        var snoozeReceived = false
        NativeEventBus.subscribe(TOPIC_WEAR_ALARM_DISMISS) { dismissReceived = true; null }
        NativeEventBus.subscribe(TOPIC_WEAR_ALARM_SNOOZE) { snoozeReceived = true; null }

        enqueueOfflineWrite(
            queue,
            "/threshold/alarm_snooze",
            "{\"alarmId\":7,\"snoozeLengthMinutes\":10}",
            busTopic = TOPIC_WEAR_ALARM_SNOOZE,
        )

        assertTrue(!dismissReceived)
        assertTrue(snoozeReceived)
    }

    @Test
    fun `publishing onto a topic nobody is subscribed to still leaves the durable enqueue intact`() {
        // No NativeEventBus.subscribe call here -- alarm-manager's listener (Phase 4A) hasn't
        // registered yet, mirroring a cold process where wear-sync's provider has run but
        // alarm-manager's own init ContentProvider hasn't (or vice versa, ordering is
        // unspecified between separate plugins' providers).
        enqueueOfflineWrite(queue, "/threshold/alarm_dismiss", "{\"alarmId\":9}", busTopic = TOPIC_WEAR_ALARM_DISMISS)

        val pending = queue.peekAll()

        assertEquals(listOf("/threshold/alarm_dismiss" to "{\"alarmId\":9}"), pending.map { it.path to it.data })
    }

    // ── nativeStopBusTopic ───────────────────────────────────────────

    @Test
    fun `nativeStopBusTopic maps dismiss and snooze paths to their own topics`() {
        assertEquals(TOPIC_WEAR_ALARM_DISMISS, nativeStopBusTopic("/threshold/alarm_dismiss"))
        assertEquals(TOPIC_WEAR_ALARM_SNOOZE, nativeStopBusTopic("/threshold/alarm_snooze"))
    }

    @Test
    fun `nativeStopBusTopic returns null for paths with no native listener`() {
        assertEquals(null, nativeStopBusTopic("/threshold/sync_request"))
        assertEquals(null, nativeStopBusTopic("/threshold/save_alarm"))
        assertEquals(null, nativeStopBusTopic("/threshold/delete_alarm"))
        assertEquals(null, nativeStopBusTopic("/threshold/not_a_real_path"))
    }

    // ── publishNativeStopBusIfPipelineNotReady (reachability fix, issue #255 Phase 4B code
    // review: a watch dismiss/snooze arriving after WearSyncPlugin.load() has set `instance`
    // but before markWatchPipelineReady() has run must still reach NativeEventBus) ──────────

    @Test
    fun `publishes onto NativeEventBus when the pipeline is not ready, even though this models a loaded plugin instance`() {
        var receivedPayload: String? = null
        NativeEventBus.subscribe(TOPIC_WEAR_ALARM_DISMISS) { payload -> receivedPayload = payload; null }

        // pipelineReady = false is exactly the "WearSyncPlugin.instance != null but
        // markWatchPipelineReady() hasn't run yet" window -- the call site in
        // WearMessageService.onMessageReceived only reaches this function once `plugin` is
        // already known non-null, so this parameter alone stands in for that state here.
        publishNativeStopBusIfPipelineNotReady("/threshold/alarm_dismiss", "{\"alarmId\":7}", pipelineReady = false)

        assertEquals("{\"alarmId\":7}", receivedPayload)
    }

    @Test
    fun `publishes the snooze payload onto the snooze topic when the pipeline is not ready`() {
        var receivedPayload: String? = null
        NativeEventBus.subscribe(TOPIC_WEAR_ALARM_SNOOZE) { payload -> receivedPayload = payload; null }

        publishNativeStopBusIfPipelineNotReady(
            "/threshold/alarm_snooze",
            "{\"alarmId\":7,\"snoozeLengthMinutes\":10}",
            pipelineReady = false,
        )

        assertEquals("{\"alarmId\":7,\"snoozeLengthMinutes\":10}", receivedPayload)
    }

    @Test
    fun `does not publish once the pipeline is ready -- the normal, fully-booted case`() {
        var published = false
        NativeEventBus.subscribe(TOPIC_WEAR_ALARM_DISMISS) { published = true; null }

        publishNativeStopBusIfPipelineNotReady("/threshold/alarm_dismiss", "{\"alarmId\":7}", pipelineReady = true)

        assertTrue(!published)
    }

    @Test
    fun `does not publish for a path with no native listener regardless of pipeline readiness`() {
        var published = false
        NativeEventBus.subscribe(TOPIC_WEAR_ALARM_DISMISS) { published = true; null }
        NativeEventBus.subscribe(TOPIC_WEAR_ALARM_SNOOZE) { published = true; null }

        publishNativeStopBusIfPipelineNotReady("/threshold/save_alarm", "{\"alarmId\":7}", pipelineReady = false)

        assertTrue(!published)
    }
}
