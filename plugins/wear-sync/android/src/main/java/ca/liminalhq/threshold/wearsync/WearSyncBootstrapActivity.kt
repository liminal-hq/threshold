// Transparent bootstrap activity that starts the main launcher activity for headless wear sync boot
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wearsync

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

private const val TAG = "WearSyncBootstrapActivity"
private const val EXTRA_HEADLESS_BOOT = "wear_sync_headless_boot"

/**
 * Lightweight trampoline activity used by [WearSyncService] for cold boots.
 *
 * This activity is transparent and no-history so the user sees minimal UI
 * while the app process launches. It forwards immediately to the main launcher
 * activity with a headless boot hint, then finishes itself.
 */
class WearSyncBootstrapActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            Log.e(TAG, "Could not get launch intent for $packageName")
            finish()
            return
        }

        launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_NO_ANIMATION
        )
        launchIntent.putExtra(EXTRA_HEADLESS_BOOT, true)
        startActivity(launchIntent)
        overridePendingTransition(0, 0)
        finish()
    }
}
