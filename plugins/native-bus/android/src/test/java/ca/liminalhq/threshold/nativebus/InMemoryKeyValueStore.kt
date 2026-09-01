// In-memory KeyValueStore fake for JUnit tests -- no Android framework required
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.nativebus

/** In-memory [KeyValueStore] fake, so tests don't need SharedPreferences/Robolectric. */
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
