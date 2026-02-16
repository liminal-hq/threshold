package ca.liminalhq.threshold.wear.presentation.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme

/**
 * Threshold Wear OS colour palette.
 *
 * Uses a deep black background with calm blue accents to match the
 * phone app's design language while being optimised for OLED watch displays.
 */
val ThresholdBackground = Color(0xFF0A0A0A)
val ThresholdSurface = Color(0xFF1A1A1A)
val ThresholdAccent = Color(0xFF4A9EFF)
val ThresholdOnSurface = Color(0xFFE0E0E0)
val ThresholdDisabled = Color(0xFF333333)
val ThresholdError = Color(0xFFCF6679)

private val ThresholdColors = Colors(
    primary = ThresholdAccent,
    onPrimary = Color.Black,
    secondary = ThresholdAccent,
    onSecondary = Color.Black,
    background = ThresholdBackground,
    onBackground = ThresholdOnSurface,
    surface = ThresholdSurface,
    onSurface = ThresholdOnSurface,
    error = ThresholdError,
    onError = Color.Black,
)

@Composable
fun ThresholdWearTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colors = ThresholdColors,
        content = content,
    )
}
