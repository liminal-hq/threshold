// Compose ringing screen — Material+Liminal hybrid with breathing ring animations
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.wear.presentation

import android.os.Build
import android.util.Log
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Text

// ── Static fallback colours (used when Material You is unavailable) ──

private val FallbackGradientTop = Color(0xFF9C4DCC)
private val FallbackGradientBottom = Color(0xFF7B1FA2)
private val FallbackHorizonGlow = Color(0xFFFFB74D)
private val StopButtonBg = Color(0xFF1A1A2E)
private val DotPatternWhite = Color.White.copy(alpha = 0.12f)
private val ThresholdAmber = Color(0xFFFFB74D)
private const val TAG = "RingingScreen"

// ── Ring animation specs (matching SVG) ─────────────────────────────

private data class RingSpec(
    val baseRadius: Float,
    val expandRadius: Float,
    val baseAlpha: Float,
    val dimAlpha: Float,
    val strokeWidth: Float,
    val delayMs: Int,
)

private val rings = listOf(
    RingSpec(70f, 85f, 0.15f, 0.08f, 1.5f, 0),
    RingSpec(90f, 105f, 0.20f, 0.08f, 1.0f, 1000),
    RingSpec(110f, 125f, 0.10f, 0.05f, 1.0f, 2000),
)

/**
 * Resolved ringing screen colours — derived from the system's Material You
 * palette when available, falling back to the static purple/amber scheme.
 *
 * On the phone, the ringing screen background uses `--app-colour-secondary-tint`
 * → `--app-colour-secondary` and the horizon glow uses `--app-colour-primary`.
 * We mirror this on the watch by reading from the Android system colour slots.
 */
private data class RingingColors(
    val gradientTop: Color,
    val gradientBottom: Color,
    val horizonGlow: Color,
)

@Composable
private fun resolveRingingColors(): RingingColors {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = LocalContext.current
        // system_accent3 = tertiary palette (selected for ringing background)
        // 500 = top shade, 700 = deeper base shade
        val tertiaryTint = Color(context.getColor(android.R.color.system_accent3_500))
        val tertiaryBase = Color(context.getColor(android.R.color.system_accent3_700))
        // system_accent2 = secondary palette (selected for horizon glow)
        val secondaryBase = Color(context.getColor(android.R.color.system_accent2_400))
        return RingingColors(
            gradientTop = tertiaryTint,
            gradientBottom = tertiaryBase,
            horizonGlow = secondaryBase,
        )
    }
    return RingingColors(
        gradientTop = FallbackGradientTop,
        gradientBottom = FallbackGradientBottom,
        horizonGlow = FallbackHorizonGlow,
    )
}

/**
 * Ringing screen for the Wear OS companion app.
 *
 * Renders the Material+Liminal hybrid design with:
 * - Theme-derived gradient background with dot pattern and horizon glow
 * - Three breathing pulse rings around the clock
 * - Time display with bloom glow
 * - Alarm label
 * - Threshold indicator (sleep → wake with animated amber dot)
 * - Stop and Snooze pill buttons
 *
 * Colours are resolved from the system's Material You palette when
 * available, matching the phone's theme-linked ringing screen.
 *
 * All animations use [rememberInfiniteTransition] — lifecycle-aware and
 * automatically paused when the composable leaves composition.
 */
@Composable
fun RingingScreen(
    hour: Int,
    minute: Int,
    label: String,
    is24Hour: Boolean = false,
    snoozeLengthMinutes: Int = 10,
    onStop: () -> Unit,
    onSnooze: () -> Unit,
) {
    val colors = resolveRingingColors()
    val context = LocalContext.current
    // Keep screen on while ringing
    KeepScreenOn()

    LaunchedEffect(colors) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val accentDump = buildString {
                append("a1[300=")
                append(context.getColor(android.R.color.system_accent1_300).toDebugHex())
                append(",400=")
                append(context.getColor(android.R.color.system_accent1_400).toDebugHex())
                append(",500=")
                append(context.getColor(android.R.color.system_accent1_500).toDebugHex())
                append("] ")
                append("a2[300=")
                append(context.getColor(android.R.color.system_accent2_300).toDebugHex())
                append(",400=")
                append(context.getColor(android.R.color.system_accent2_400).toDebugHex())
                append(",500=")
                append(context.getColor(android.R.color.system_accent2_500).toDebugHex())
                append("] ")
                append("a3[300=")
                append(context.getColor(android.R.color.system_accent3_300).toDebugHex())
                append(",400=")
                append(context.getColor(android.R.color.system_accent3_400).toDebugHex())
                append(",500=")
                append(context.getColor(android.R.color.system_accent3_500).toDebugHex())
                append("] ")
                append("n1[100=")
                append(context.getColor(android.R.color.system_neutral1_100).toDebugHex())
                append(",500=")
                append(context.getColor(android.R.color.system_neutral1_500).toDebugHex())
                append(",900=")
                append(context.getColor(android.R.color.system_neutral1_900).toDebugHex())
                append("] ")
                append("n2[100=")
                append(context.getColor(android.R.color.system_neutral2_100).toDebugHex())
                append(",500=")
                append(context.getColor(android.R.color.system_neutral2_500).toDebugHex())
                append(",900=")
                append(context.getColor(android.R.color.system_neutral2_900).toDebugHex())
                append("]")
            }
            Log.d(TAG, "Material You palettes: $accentDump")
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "ringing")

    // ── Breathing ring animations ───────────────────────────────────

    data class RingAnim(val radius: Float, val alpha: Float)

    val ringAnims = rings.map { spec ->
        val radius by infiniteTransition.animateFloat(
            initialValue = spec.baseRadius,
            targetValue = spec.expandRadius,
            animationSpec = infiniteRepeatable(
                animation = tween(
                    durationMillis = 2000,
                    delayMillis = spec.delayMs,
                    easing = LinearEasing,
                ),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "ring-r-${spec.baseRadius}",
        )
        val alpha by infiniteTransition.animateFloat(
            initialValue = spec.baseAlpha,
            targetValue = spec.dimAlpha,
            animationSpec = infiniteRepeatable(
                animation = tween(
                    durationMillis = 2000,
                    delayMillis = spec.delayMs,
                    easing = LinearEasing,
                ),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "ring-a-${spec.baseRadius}",
        )
        RingAnim(radius, alpha)
    }

    // ── Threshold dot animation (2s pulse) ──────────────────────────

    val dotAlpha by infiniteTransition.animateFloat(
        initialValue = 0.9f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dot-alpha",
    )
    val dotRingRadius by infiniteTransition.animateFloat(
        initialValue = 7f,
        targetValue = 11f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dot-ring-r",
    )
    val dotRingAlpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 0.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dot-ring-a",
    )

    val isPm = hour >= 12
    val hour12 = when (val h = hour % 12) {
        0 -> 12
        else -> h
    }
    val timeText = if (is24Hour) "%02d:%02d".format(hour, minute) else "%d:%02d".format(hour12, minute)

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val compact = maxHeight <= 192.dp
        val timeFontSize = if (compact) 46.sp else 52.sp
        val labelFontSize = if (compact) 13.sp else 14.sp
        val stopHeight: Dp = if (compact) 38.dp else 40.dp
        val snoozeHeight: Dp = if (compact) 34.dp else 36.dp
        val topSpacingWeight = if (compact) 0.2f else 0.24f

        // ── Background layers ───────────────────────────────────────
        BackgroundCanvas(colors)

        // ── Breathing rings ─────────────────────────────────────────
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cx = size.width / 2f
            // Rings centered higher (at ~37% of height, matching SVG cy=142/384)
            val ringCy = size.height * 0.37f

            // Draw breathing rings
            for ((i, anim) in ringAnims.withIndex()) {
                drawCircle(
                    color = Color.White.copy(alpha = anim.alpha),
                    radius = anim.radius,
                    center = Offset(cx, ringCy),
                    style = Stroke(width = rings[i].strokeWidth),
                )
            }
        }

        // ── Content overlay ─────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp)
                .padding(top = if (compact) 6.dp else 8.dp, bottom = if (compact) 8.dp else 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top,
        ) {
            // Push time to the upper third of the screen
            Spacer(modifier = Modifier.weight(topSpacingWeight))

            // Time with stacked AM/PM markers
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = timeText,
                    fontSize = timeFontSize,
                    fontWeight = FontWeight.Light,
                    color = Color.White.copy(alpha = 0.95f),
                    letterSpacing = (-1).sp,
                    textAlign = TextAlign.Center,
                )
                if (!is24Hour) {
                    Column(
                        modifier = Modifier.padding(start = 6.dp, top = 6.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.Start,
                    ) {
                        Text(
                            text = "AM",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White.copy(alpha = if (isPm) 0.28f else 0.95f),
                            lineHeight = 12.sp,
                        )
                        Text(
                            text = "PM",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White.copy(alpha = if (isPm) 0.95f else 0.28f),
                            lineHeight = 12.sp,
                        )
                    }
                }
            }

            // Label
            if (label.isNotBlank()) {
                Text(
                    text = label,
                    fontSize = labelFontSize,
                    fontWeight = FontWeight.Normal,
                    color = Color.White.copy(alpha = 0.95f),
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth(0.84f)
                        .padding(top = 0.dp),
                )
            }

            Spacer(modifier = Modifier.height(if (compact) 2.dp else 4.dp))
            ThresholdIndicatorCanvas(
                dotAlpha = dotAlpha,
                dotRingRadius = dotRingRadius,
                dotRingAlpha = dotRingAlpha,
            )
            Spacer(modifier = Modifier.weight(1f))

            // ── Buttons ─────────────────────────────────────────────
            // Stop Alarm — dark pill
            Button(
                onClick = onStop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(stopHeight),
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = StopButtonBg.copy(alpha = 0.9f),
                ),
                shape = RoundedCornerShape(22.dp),
            ) {
                Text(
                    text = "Stop Alarm",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White.copy(alpha = 0.95f),
                    letterSpacing = 0.5.sp,
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Snooze — ghost outline pill
            Button(
                onClick = onSnooze,
                modifier = Modifier
                    .fillMaxWidth(0.88f)
                    .height(snoozeHeight),
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = Color.Transparent,
                ),
                border = ButtonDefaults.outlinedButtonBorder(
                    borderColor = Color.White.copy(alpha = 0.6f),
                    borderWidth = 2.dp,
                ),
                shape = RoundedCornerShape(20.dp),
            ) {
                Text(
                    text = "Snooze (${snoozeLengthMinutes}m)",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color.White.copy(alpha = 0.9f),
                    letterSpacing = 0.5.sp,
                )
            }

            Spacer(modifier = Modifier.height(2.dp))
        }
    }
}

private fun Color.toDebugHex(): String = String.format("#%08X", this.toArgb())

private fun Int.toDebugHex(): String = String.format("#%08X", this)

// ── Background: gradient + dot pattern + horizon glow ───────────────

@Composable
private fun BackgroundCanvas(colors: RingingColors) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        // Theme gradient
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(colors.gradientTop, colors.gradientBottom),
            ),
        )

        // Horizon glow at bottom
        val glowCenter = Offset(size.width / 2f, size.height * 0.88f)
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    colors.horizonGlow.copy(alpha = 0.2f),
                    colors.gradientBottom.copy(alpha = 0f),
                ),
                center = glowCenter,
                radius = size.width * 0.52f,
            ),
            center = glowCenter,
            radius = size.width * 0.52f,
        )

        // Dot pattern (40dp grid, ~40px on mdpi watch)
        val step = 40f
        var x = step / 2f
        while (x < size.width) {
            var y = step / 2f
            while (y < size.height) {
                drawCircle(
                    color = DotPatternWhite,
                    radius = 1f,
                    center = Offset(x, y),
                )
                y += step
            }
            x += step
        }

        // Vignette — darken edges for round watch depth
        // Commented out: may not be needed on real round watch hardware
        // where the bezel provides natural edge darkening.
        // drawCircle(
        //     brush = Brush.radialGradient(
        //         colorStops = arrayOf(
        //             0.55f to vignetteBase.copy(alpha = 0f),
        //             1.0f to Color.Black.copy(alpha = 0.85f),
        //         ),
        //         center = Offset(size.width / 2f, size.height / 2f),
        //         radius = size.width / 2f,
        //     ),
        //     center = Offset(size.width / 2f, size.height / 2f),
        //     radius = size.width / 2f,
        // )
    }
}

// ── Threshold indicator drawing ─────────────────────────────────────

@Composable
private fun ThresholdIndicatorCanvas(
    dotAlpha: Float,
    dotRingRadius: Float,
    dotRingAlpha: Float,
) {
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(18.dp),
    ) {
        val cx = size.width / 2f
        val cy = size.height * 0.34f
        val lineHalfWidth = 28f
        drawThresholdIndicator(
            cx = cx,
            cy = cy,
            halfWidth = lineHalfWidth,
            dotAlpha = dotAlpha,
            dotRingRadius = dotRingRadius,
            dotRingAlpha = dotRingAlpha,
        )
    }
}

private fun DrawScope.drawThresholdIndicator(
    cx: Float,
    cy: Float,
    halfWidth: Float,
    dotAlpha: Float,
    dotRingRadius: Float,
    dotRingAlpha: Float,
) {
    // Line
    drawLine(
        color = Color.White.copy(alpha = 0.3f),
        start = Offset(cx - halfWidth, cy),
        end = Offset(cx + halfWidth, cy),
        strokeWidth = 1.5f,
    )
    // Sleep endpoint
    drawCircle(
        color = Color.White.copy(alpha = 0.4f),
        radius = 3f,
        center = Offset(cx - halfWidth, cy),
    )
    // Wake endpoint
    drawCircle(
        color = Color.White.copy(alpha = 0.3f),
        radius = 3f,
        center = Offset(cx + halfWidth, cy),
    )
    // Threshold dot (pulsing amber)
    drawCircle(
        color = ThresholdAmber.copy(alpha = dotAlpha),
        radius = 4f,
        center = Offset(cx, cy),
    )
    // Threshold dot ring (expanding)
    drawCircle(
        color = ThresholdAmber.copy(alpha = dotRingAlpha),
        radius = dotRingRadius,
        center = Offset(cx, cy),
        style = Stroke(width = 1.5f),
    )
}

// ── Keep screen on side-effect ──────────────────────────────────────

@Composable
private fun KeepScreenOn() {
    val view = LocalView.current
    DisposableEffect(Unit) {
        view.keepScreenOn = true
        onDispose {
            view.keepScreenOn = false
        }
    }
}
