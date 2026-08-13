// In-memory KeyValueStore fake for JUnit tests -- no Android framework required
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import ca.liminalhq.threshold.nativebus.KeyValueStore

/**
 * In-memory [KeyValueStore] fake, so tests don't need SharedPreferences/Robolectric.
 *
 * Duplicated from native-bus's own test-only fake of the same name/shape rather than
 * shared across module test source sets -- Gradle doesn't expose one module's `test`
 * sources to another's by default, and no `testFixtures` artifact exists yet for this
 * (mirrors [NativeEventLog]'s existing duplication-over-sharing rationale in this plugin).
 */
class InMemoryKeyValueStore : KeyValueStore {
    private val values = mutableMapOf<String, String>()

    override fun get(key: String): String? = values[key]

    override fun set(key: String, value: String) {
        values[key] = value
    }

    override fun remove(key: String) {
        values.remove(key)
    }
}
