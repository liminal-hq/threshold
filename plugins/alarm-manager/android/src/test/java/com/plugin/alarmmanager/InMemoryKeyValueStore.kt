// In-memory KeyValueStore fake for JUnit tests -- no Android framework required
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import ca.liminalhq.threshold.nativebus.KeyValueStore

/**
 * In-memory [KeyValueStore] fake, so tests don't need SharedPreferences/Robolectric.
 *
 * A local copy of `native-bus`'s own test-only fake of the same name
 * (`ca.liminalhq.threshold.nativebus.InMemoryKeyValueStore`) -- that one lives under
 * native-bus's `src/test/`, which this module's `implementation(project(...))` dependency
 * doesn't expose (only a module's `main` source set output is shared that way), so this
 * plugin's own tests need their own copy of the same trivial fake.
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
