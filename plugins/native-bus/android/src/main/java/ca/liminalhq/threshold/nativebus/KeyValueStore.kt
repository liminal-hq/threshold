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

    /**
     * Applies every entry in [sets] and removes every key in [removes] as a single atomic
     * unit, so a caller can never observe a state partway through -- e.g. a new value written
     * but an old key it's meant to replace not yet removed, if the process dies in between.
     * Callers that need that all-or-nothing guarantee (see [SharedPreferencesKeyValueStore]'s
     * override) should use this instead of separate [set]/[remove] calls.
     *
     * The default implementation just applies them sequentially via [set]/[remove] -- fine for
     * simple in-memory fakes with no concurrent reader that could observe a torn state, but not
     * a real atomicity guarantee. Override this on any [KeyValueStore] backed by real
     * persistence.
     */
    fun batch(sets: Map<String, String> = emptyMap(), removes: Set<String> = emptySet()) {
        sets.forEach { (key, value) -> set(key, value) }
        removes.forEach { remove(it) }
    }
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

    override fun batch(sets: Map<String, String>, removes: Set<String>) {
        val editor = prefs.edit()
        sets.forEach { (key, value) -> editor.putString(key, value) }
        removes.forEach { editor.remove(it) }
        editor.apply()
    }
}
