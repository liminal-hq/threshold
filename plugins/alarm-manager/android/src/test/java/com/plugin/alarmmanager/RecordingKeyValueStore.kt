// KeyValueStore fake that records batch() vs. direct set()/remove() calls, for JUnit tests
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import ca.liminalhq.threshold.nativebus.KeyValueStore

/**
 * [KeyValueStore] fake that records every [batch] call (its arguments) separately from direct
 * [set]/[remove] calls, so a test can assert that a piece of production code went through the
 * atomic [batch] path rather than issuing separate, unguarded writes -- see
 * `AlarmManagerPluginTest`'s migration-atomicity test, which exists specifically to catch a
 * regression back to the two-step "write the new log, then remove the legacy keys" sequence
 * that could leave a torn state behind if the process died in between.
 *
 * Storage itself is delegated to a plain [InMemoryKeyValueStore] -- this class only adds the
 * call-recording layer on top.
 */
class RecordingKeyValueStore : KeyValueStore {
    private val delegate = InMemoryKeyValueStore()

    /** Arguments of every [batch] call, in call order. */
    val batchCalls = mutableListOf<Pair<Map<String, String>, Set<String>>>()

    /** Count of direct (non-batched) [set]/[remove] calls. */
    var directWriteCalls = 0
        private set

    /** Seeds [key] with [value] without counting as a "direct write" -- for test setup only. */
    fun seed(key: String, value: String) {
        delegate.set(key, value)
    }

    override fun get(key: String): String? = delegate.get(key)

    override fun set(key: String, value: String) {
        directWriteCalls++
        delegate.set(key, value)
    }

    override fun remove(key: String) {
        directWriteCalls++
        delegate.remove(key)
    }

    override fun batch(sets: Map<String, String>, removes: Set<String>) {
        batchCalls.add(sets to removes)
        sets.forEach { (key, value) -> delegate.set(key, value) }
        removes.forEach { delegate.remove(it) }
    }
}
