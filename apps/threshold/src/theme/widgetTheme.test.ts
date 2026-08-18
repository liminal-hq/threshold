// Tests for widget theme colour mapping
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, it, expect } from 'vitest';
import { computeWidgetTheme } from './widgetTheme';
import { deepNightLight, deepNightDark, getContrastRatio, ThemeDefinition } from './themes';

const WCAG_AA_NORMAL_TEXT = 4.5;
const HEX_RRGGBB = /^#[0-9a-f]{6}$/;

describe('computeWidgetTheme', () => {
	it('maps deep-night onto the eight widget roles as lowercase #rrggbb hex', () => {
		const palettes = computeWidgetTheme(deepNightLight, deepNightDark);

		for (const mode of ['light', 'dark'] as const) {
			const palette = palettes[mode];
			for (const role of Object.keys(palette) as (keyof typeof palette)[]) {
				expect(palette[role]).toMatch(HEX_RRGGBB);
			}
		}

		// fill mirrors the card surface, rail mirrors the accent rail (primary.main -- see
		// accentRailSx in alarmCardStyles.ts).
		expect(palettes.light.fill).toBe(deepNightLight.muiPalette.background.paper.toLowerCase());
		expect(palettes.dark.fill).toBe(deepNightDark.muiPalette.background.paper.toLowerCase());
		expect(getContrastRatio(palettes.light.rail, palettes.light.fill)).toBeGreaterThanOrEqual(
			WCAG_AA_NORMAL_TEXT,
		);
		expect(getContrastRatio(palettes.dark.rail, palettes.dark.fill)).toBeGreaterThanOrEqual(
			WCAG_AA_NORMAL_TEXT,
		);
	});

	it('corrects a deliberately low-contrast theme up to WCAG AA', () => {
		// primary/secondary/text.primary/text.secondary all identical to the card background --
		// zero contrast at face value, the exact case ensureContrastAA exists to fix.
		const flat: ThemeDefinition = {
			id: 'deep-night',
			variables: {},
			muiPalette: {
				primary: { main: '#ffffff' },
				secondary: { main: '#ffffff' },
				background: { default: '#ffffff', paper: '#ffffff' },
				text: { primary: '#ffffff', secondary: '#ffffff' },
			},
		};

		const palettes = computeWidgetTheme(flat, flat);

		for (const mode of ['light', 'dark'] as const) {
			const palette = palettes[mode];
			for (const role of ['rail', 'eyebrow', 'time', 'label'] as const) {
				expect(getContrastRatio(palette[role], palette.fill)).toBeGreaterThanOrEqual(
					WCAG_AA_NORMAL_TEXT,
				);
			}
		}
	});
});
