// Minimal string key-value storage abstraction, so persistence-backed classes can be unit tested
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.nativebus

import android.content.Context

/**
 * A tiny string-keyed, string-valued store.
 *
 * This exists purely so classes like [DurableEventQueue] can be unit tested against an in-memory fake instead of needing Robolectric or instrumentation tests -- this codebase's `test-kotlin-plugins` CI job runs plain JUnit 4 against the host JVM, with no Android framework available.
 */
interface KeyValueStore {
    /** Returns the value for [key], or `null` if it has never been set. */
    fun get(key: String): String?

    /** Stores [value] under [key], overwriting any previous value. */
    fun set(key: String, value: String)

    /** Removes [key] entirely. A no-op if it was never set. */
    fun remove(key: String)
}

/**
 * Production [KeyValueStore] backed by a single [android.content.SharedPreferences] file.
 */
class SharedPreferencesKeyValueStore(
    context: Context,
    prefsName: String,
) : KeyValueStore {

    private val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)

    override fun get(key: String): String? = prefs.getString(key, null)

    override fun set(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }
}
