// Lightweight native-side event logger, written into Tauri's own log directory
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.alarmmanager

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Appends timestamped lines to a file in Tauri's own `app_log_dir()`
 * (`context.filesDir.parentFile/logs`, confirmed against a real device export --
 * Tauri's Android path resolver has no public Kotlin source available to read
 * directly), so entries surface in the existing "Export event log" feature's
 * `read_and_format_logs()` merge without any IPC round-trip to Rust.
 *
 * This is deliberately independent of Rust/the webview being booted at all --
 * the whole point is capturing native events (AlarmReceiver, WearSyncService,
 * etc.) that can happen before either is alive.
 *
 * Each plugin's copy of this object writes to its own distinct file (this one:
 * `Threshold-alarm-manager.log`) rather than sharing one file across plugins --
 * `read_and_format_logs()` merges every `Threshold*.log` file it finds, so
 * splitting by plugin needs no Rust-side change and, more importantly, means
 * there's no file for two independently-`@Synchronized` copies of this object
 * (one per plugin) to race over in the first place.
 */
object NativeEventLog {
	private const val FILE_NAME = "Threshold-alarm-manager.log"
	private const val MAX_BYTES = 512 * 1024L
	private val formatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

	@Synchronized
	fun log(context: Context, tag: String, message: String) {
		try {
			val logsDir = File(context.filesDir.parentFile, "logs")
			if (!logsDir.exists()) {
				logsDir.mkdirs()
			}
			val file = File(logsDir, FILE_NAME)
			if (file.exists() && file.length() > MAX_BYTES) {
				file.delete()
			}
			val timestamp = formatter.format(Date())
			file.appendText("[$timestamp][$tag] $message\n")
		} catch (e: Exception) {
			Log.w("NativeEventLog", "Failed to write native event log", e)
		}
	}
}
