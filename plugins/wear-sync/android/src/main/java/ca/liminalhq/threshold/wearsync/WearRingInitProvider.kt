// ContentProvider that registers the native fired->watch-ring listener before anything else can run
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.util.Log

private const val TAG = "WearRingInitProvider"

/**
 * Guarantees [NativeFiredListener] is subscribed to [NativeEventBus] before anything else in
 * the app can run, including on a cold multi-plugin process start.
 * `ContentProvider.onCreate()` is documented to always run before any `Activity`/`Service`/
 * `BroadcastReceiver` callback -- this is the same Jetpack/WorkManager/Firebase early-init
 * trick, and the mechanism issue #255's Phase 0 spike
 * (`feat/255-p0-contentprovider-spike`, see its `BusInitProvider.kt`) proved out on a real
 * device ahead of this, the production implementation.
 *
 * Unlike that spike, this provider is not debug-gated: it ships in every build, since this
 * is the actual fix for issue #254 (the watch staying silent for ~20s when an alarm fires
 * cold while the phone is in active use, because the watch ring used to depend on Rust
 * booting first). `android:exported="false"` in the manifest -- this provider has no real
 * data to serve and no external caller.
 */
class WearRingInitProvider : ContentProvider() {

    override fun onCreate(): Boolean {
        val ctx = context
        if (ctx == null) {
            // ContentProvider.onCreate() is documented to always have an attached Context by
            // the time it runs; this is defensive only, not an expected path.
            Log.e(TAG, "onCreate() called with no attached Context")
            return true
        }

        NativeFiredListener.register(ctx)
        Log.d(TAG, "WearRingInitProvider.onCreate() fired, native fired listener registered")

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
