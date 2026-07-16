// Lightweight native-side event logger for the Wear OS app's own private storage
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Appends timestamped lines to a file in the watch app's own private storage.
 *
 * There's no Tauri/Rust runtime on the Wear OS side (this is a plain native
 * Kotlin/Compose app), so unlike the phone's copy of this same utility, there's
 * no shared "app_log_dir()" to write into -- this file is later read and sent
 * to the phone on request (see [ca.liminalhq.threshold.wear.service.DataLayerListenerService]),
 * where it's merged into the phone's own event log export.
 *
 * Capped much smaller than the phone's copy: this file's content has to fit in
 * a single Data Layer `MessageClient` payload (~100 KB practical limit) to avoid
 * needing multi-part transfer for what's meant to be a quick spike.
 */
object NativeEventLog {
	private const val FILE_NAME = "threshold-wear-native.log"
	private const val MAX_BYTES = 64 * 1024L
	private val formatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

	@Synchronized
	fun log(context: Context, tag: String, message: String) {
		try {
			val file = File(context.filesDir, FILE_NAME)
			if (file.exists() && file.length() > MAX_BYTES) {
				file.delete()
			}
			val timestamp = formatter.format(Date())
			file.appendText("[$timestamp][$tag] $message\n")
		} catch (e: Exception) {
			Log.w("NativeEventLog", "Failed to write native event log", e)
		}
	}

	/** Reads the current log content, or an empty string if nothing's been logged yet. */
	@Synchronized
	fun read(context: Context): String {
		return try {
			val file = File(context.filesDir, FILE_NAME)
			if (file.exists()) file.readText() else ""
		} catch (e: Exception) {
			Log.w("NativeEventLog", "Failed to read native event log", e)
			""
		}
	}
}
