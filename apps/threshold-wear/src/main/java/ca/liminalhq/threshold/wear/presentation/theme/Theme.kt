// Wear OS theme — Material You dynamic colours with static fallback for older devices
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.presentation.theme

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme

/**
 * Threshold Wear OS colour palette.
 *
 * On API 31+ (Wear OS 3.5+), the accent colour is pulled from the
 * watch's Material You / system colour scheme. On older watches,
 * the static calm blue (#4A9EFF) is used as the fallback.
 *
 * Background and surface colours are always deep black for OLED
 * regardless of the system theme.
 */

// ── Static fallback colours ─────────────────────────────────────────

val ThresholdBackground = Color(0xFF0A0A0A)
val ThresholdSurface = Color(0xFF1A1A1A)
val ThresholdOnSurface = Color(0xFFE0E0E0)
val ThresholdDisabled = Color(0xFF333333)
val ThresholdError = Color(0xFFCF6679)

/** Static accent — used when the device doesn't support Material You. */
private val StaticAccent = Color(0xFF4A9EFF)

// ── Dynamic colour holder ───────────────────────────────────────────

/**
 * Holds the resolved accent colour (dynamic or static) so composables
 * outside of [MaterialTheme] can access it via [LocalThresholdAccent].
 */
val LocalThresholdAccent = staticCompositionLocalOf { StaticAccent }

/**
 * Convenience accessor — use `ThresholdAccent` anywhere in the composable
 * tree wrapped by [ThresholdWearTheme].
 */
val ThresholdAccent: Color
    @Composable get() = LocalThresholdAccent.current

// ── Theme ───────────────────────────────────────────────────────────

@Composable
fun ThresholdWearTheme(content: @Composable () -> Unit) {
    val accent = resolveAccentColour()

    val colors = Colors(
        primary = accent,
        onPrimary = Color.Black,
        secondary = accent,
        onSecondary = Color.Black,
        background = ThresholdBackground,
        onBackground = ThresholdOnSurface,
        surface = ThresholdSurface,
        onSurface = ThresholdOnSurface,
        error = ThresholdError,
        onError = Color.Black,
    )

    CompositionLocalProvider(LocalThresholdAccent provides accent) {
        MaterialTheme(
            colors = colors,
            content = content,
        )
    }
}

/**
 * Resolve the accent colour from the system's Material You palette
 * on API 31+, falling back to the static Threshold blue on older devices.
 */
@Composable
private fun resolveAccentColour(): Color {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = LocalContext.current
        val systemAccent = context.getColor(android.R.color.system_accent1_200)
        return Color(systemAccent)
    }
    return StaticAccent
}
