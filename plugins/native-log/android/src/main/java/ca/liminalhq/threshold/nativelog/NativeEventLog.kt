// Shared native-side event logger, written into Tauri's own log directory
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.nativelog

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * One instance per plugin, e.g. `internal val nativeLog = NativeEventLog("alarm-manager")`
 * declared once (see each plugin's own `Logging.kt`) and used package-wide from there --
 * Kotlin top-level properties are visible to every file in the same package without an
 * import, so call sites just do `nativeLog.d(context, TAG, "...")`.
 *
 * Each call writes to **both** `android.util.Log` and a timestamped line in a file in
 * Tauri's own `app_log_dir()` (`context.filesDir.parentFile/logs`, confirmed against a
 * real device export -- Tauri's Android path resolver has no public Kotlin source
 * available to read directly), so a single call gets you both logcat visibility during
 * development and a durable record that survives into the app's "Export event log"
 * feature (`read_and_format_logs()` in Rust merges every `Threshold*.log` file it finds
 * in that directory). Before this shared class existed, call sites had to make both
 * calls themselves -- separately, with no guarantee the two messages even matched --
 * which is exactly the kind of gap that made a real on-device incident hard to
 * reconstruct from the exported log (see issue #322).
 *
 * Deliberately independent of Rust/the webview being booted at all -- the whole point is
 * capturing native events (AlarmReceiver, WearSyncService, etc.) that can happen before
 * either is alive.
 *
 * Each plugin's instance writes to its own distinct file (`Threshold-<pluginName>.log`)
 * rather than sharing one file across plugins -- `read_and_format_logs()` merges every
 * `Threshold*.log` file it finds, so splitting by plugin needs no Rust-side change and,
 * more importantly, means there's no file for two plugins' instances to race over in the
 * first place (each instance is itself `@Synchronized` against its own file, but two
 * *different* instances writing to two different files never contend at all).
 *
 * @param pluginName used to derive this instance's file name -- `Threshold-<pluginName>.log`.
 * @param maxBytes the file is dropped and restarted once it exceeds this size, so a
 *   noisy plugin can't grow its log file unboundedly on a device that's rarely restarted.
 */
class NativeEventLog(private val pluginName: String, private val maxBytes: Long = DEFAULT_MAX_BYTES) {
    private val fileName = "Threshold-$pluginName.log"
    // Per-instance, not shared via the companion object -- SimpleDateFormat isn't
    // thread-safe, and `write()` below only synchronizes per plugin instance (on
    // `this`), so a formatter shared *across* plugins' instances could still see
    // concurrent access from two different locks.
    private val formatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

    fun d(context: Context, tag: String, message: String) = write(context, tag, message, Log.DEBUG)

    fun i(context: Context, tag: String, message: String) = write(context, tag, message, Log.INFO)

    fun w(context: Context, tag: String, message: String, throwable: Throwable? = null) =
        write(context, tag, message, Log.WARN, throwable)

    fun e(context: Context, tag: String, message: String, throwable: Throwable? = null) =
        write(context, tag, message, Log.ERROR, throwable)

    @Synchronized
    private fun write(context: Context, tag: String, message: String, level: Int, throwable: Throwable? = null) {
        val fullMessage = if (throwable != null) {
            "$message\n${Log.getStackTraceString(throwable)}"
        } else {
            message
        }
        Log.println(level, tag, fullMessage)

        try {
            val logsDir = File(context.filesDir.parentFile, "logs")
            if (!logsDir.exists()) {
                logsDir.mkdirs()
            }
            val file = File(logsDir, fileName)
            if (file.exists() && file.length() > maxBytes) {
                file.delete()
            }
            val timestamp = formatter.format(Date())
            file.appendText("[$timestamp][$tag] $fullMessage\n")
        } catch (e: Exception) {
            Log.w("NativeEventLog", "Failed to write native event log for $pluginName", e)
        }
    }

    private companion object {
        const val DEFAULT_MAX_BYTES = 512 * 1024L
    }
}
