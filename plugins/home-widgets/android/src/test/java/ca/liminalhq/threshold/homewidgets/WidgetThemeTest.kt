// Tests the pure hex-colour and theme-JSON parsing behind the widget's themed render path
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package ca.liminalhq.threshold.homewidgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetThemeTest {
    private val sampleThemeJson = """
        {
            "light": { "fill": "#ffffff", "stroke": "#dfe5ee", "rail": "#002244", "eyebrow": "#b5582f", "time": "#1a1a1a", "label": "#5a6a80", "railMuted": "#aab4c2", "textMuted": "#5a6a80" },
            "dark": { "fill": "#2a364b", "stroke": "#3e5272", "rail": "#4c8dff", "eyebrow": "#ff8f5d", "time": "#f5f8ff", "label": "#a9bad1", "railMuted": "#3b4c66", "textMuted": "#7f90a8" }
        }
    """.trimIndent()

    @Test
    fun `parseHexColour parses a valid lowercase hex colour to an opaque ARGB int`() {
        assertEquals(0xff002244.toInt(), parseHexColour("#002244"))
        assertEquals(0xffffffff.toInt(), parseHexColour("#ffffff"))
        assertEquals(0xff000000.toInt(), parseHexColour("#000000"))
    }

    @Test
    fun `parseHexColour rejects a missing hash prefix`() {
        assertNull(parseHexColour("002244"))
    }

    @Test
    fun `parseHexColour rejects the wrong length`() {
        assertNull(parseHexColour("#02244"))
        assertNull(parseHexColour("#0022440"))
    }

    @Test
    fun `parseHexColour rejects non-hex characters`() {
        assertNull(parseHexColour("#00zz44"))
    }

    @Test
    fun `parseHexColour rejects uppercase hex digits`() {
        assertNull(parseHexColour("#ABCDEF"))
    }

    @Test
    fun `parseWidgetTheme parses a valid theme into light and dark palettes`() {
        val theme = parseWidgetTheme(sampleThemeJson)

        assertEquals(parseHexColour("#ffffff"), theme?.light?.fill)
        assertEquals(parseHexColour("#b5582f"), theme?.light?.eyebrow)
        assertEquals(parseHexColour("#2a364b"), theme?.dark?.fill)
        assertEquals(parseHexColour("#ff8f5d"), theme?.dark?.eyebrow)
    }

    @Test
    fun `parseWidgetTheme returns null for a null input`() {
        assertNull(parseWidgetTheme(null))
    }

    @Test
    fun `parseWidgetTheme returns null for a blank input`() {
        assertNull(parseWidgetTheme("  "))
    }

    @Test
    fun `parseWidgetTheme returns null for malformed JSON`() {
        assertNull(parseWidgetTheme("{ not valid json"))
    }

    @Test
    fun `parseWidgetTheme returns null when a palette is missing a role`() {
        val missingRole = """
            {
                "light": { "fill": "#ffffff", "stroke": "#dfe5ee", "rail": "#002244", "eyebrow": "#b5582f", "time": "#1a1a1a", "label": "#5a6a80", "railMuted": "#aab4c2" },
                "dark": { "fill": "#2a364b", "stroke": "#3e5272", "rail": "#4c8dff", "eyebrow": "#ff8f5d", "time": "#f5f8ff", "label": "#a9bad1", "railMuted": "#3b4c66", "textMuted": "#7f90a8" }
            }
        """.trimIndent()

        assertNull(parseWidgetTheme(missingRole))
    }

    @Test
    fun `parseWidgetTheme returns null when a palette has a bad hex colour`() {
        val badHex = """
            {
                "light": { "fill": "#ffffff", "stroke": "#dfe5ee", "rail": "#002244", "eyebrow": "not-a-colour", "time": "#1a1a1a", "label": "#5a6a80", "railMuted": "#aab4c2", "textMuted": "#5a6a80" },
                "dark": { "fill": "#2a364b", "stroke": "#3e5272", "rail": "#4c8dff", "eyebrow": "#ff8f5d", "time": "#f5f8ff", "label": "#a9bad1", "railMuted": "#3b4c66", "textMuted": "#7f90a8" }
            }
        """.trimIndent()

        assertNull(parseWidgetTheme(badHex))
    }
}
