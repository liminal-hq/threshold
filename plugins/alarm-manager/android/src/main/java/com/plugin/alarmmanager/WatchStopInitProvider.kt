// ContentProvider that registers the native watch->phone stop listener before anything else can run
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.util.Log

private const val TAG = "WatchStopInitProvider"

/**
 * Guarantees [WatchStopListener] is subscribed to `NativeEventBus` before anything else in the
 * app can run, including on a cold multi-plugin process start. `ContentProvider.onCreate()` is
 * documented to always run before any `Activity`/`Service`/`BroadcastReceiver` callback -- the
 * same early-init mechanism wear-sync's `WearRingInitProvider` established in issue #255 Phase
 * 3B for the opposite (fired->watch) direction; this is that pattern applied to the
 * watch->phone stop direction (Phase 4A).
 *
 * Not debug-gated: it ships in every build, since a watch-originated dismiss/snooze needs to
 * silence the phone's ringing regardless of whether the phone's Tauri runtime has booted yet.
 * `android:exported="false"` in the manifest -- this provider has no real data to serve and no
 * external caller.
 */
class WatchStopInitProvider : ContentProvider() {

    override fun onCreate(): Boolean {
        val ctx = context
        if (ctx == null) {
            // ContentProvider.onCreate() is documented to always have an attached Context by
            // the time it runs; this is defensive only, not an expected path.
            Log.e(TAG, "onCreate() called with no attached Context")
            return true
        }

        WatchStopListener.register(ctx)
        Log.d(TAG, "WatchStopInitProvider.onCreate() fired, listener registered")

        return true
    }

    // Everything below is a deliberate no-op -- this is not a real content provider, it
    // exists purely for the onCreate() timing guarantee above.

    override fun query(
        uri: Uri,
        projection: Array<String>?,
        selection: String?,
        selectionArgs: Array<String>?,
        sortOrder: String?,
    ): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<String>?,
    ): Int = 0
}
