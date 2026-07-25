// Tests for theme colour generation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, it, expect } from 'vitest';
import {
	generateSystemTheme,
	deepNightLight,
	deepNightDark,
	themes,
	getContrastRatio,
	ensureContrastAA,
	pickContrastText,
	MaterialYouResponse,
} from './themes';

const WCAG_AA_NORMAL_TEXT = 4.5;

describe('themes', () => {
	it('should generate system theme using deep-night defaults when no colours provided', () => {
		const light = generateSystemTheme(false, undefined);
		expect(light.variables['--app-colour-primary']).toBe(
			deepNightLight.variables['--app-colour-primary'],
		);

		const dark = generateSystemTheme(true, undefined);
		expect(dark.variables['--app-colour-primary']).toBe(
			deepNightDark.variables['--app-colour-primary'],
		);
	});

	it('should override primary/secondary with system colours, corrected for contrast', () => {
		const response: MaterialYouResponse = {
			supported: true,
			apiLevel: 34,
			palettes: {
				system_accent1: { '600': '#ff0000' },
				system_accent3: { '600': '#00ff00' },
			},
		};

		const theme = generateSystemTheme(false, response);

		// Pure red/green at face value both fail WCAG AA against the (white, deep-night-light
		// fallback) card background -- ensureContrastAA must have adjusted lightness (preserving
		// hue) until they clear it, rather than passing the wallpaper-extracted value through
		// untouched the way this used to.
		expect(theme.variables['--app-colour-primary']).toMatch(/^hsl\(0, 100%, \d+%\)$/);
		expect(theme.variables['--app-colour-secondary']).toMatch(/^hsl\(120, 100%, \d+%\)$/);
		expect(
			getContrastRatio(theme.variables['--app-colour-primary'], theme.muiPalette.background.paper),
		).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
		expect(
			getContrastRatio(
				theme.variables['--app-colour-secondary'],
				theme.muiPalette.background.paper,
			),
		).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it('should apply dark mode neutral overrides if provided', () => {
		const response: MaterialYouResponse = {
			supported: true,
			apiLevel: 34,
			palettes: {
				system_accent1: { '600': '#ff0000' },
				system_neutral1: { '900': '#111111' },
			},
		};

		const theme = generateSystemTheme(true, response);
		expect(theme.variables['--app-background-colour']).toBe('#111111');
	});

	it('should reproduce and fix issue #290 -- a wallpaper accent close in lightness to the card background', () => {
		// A dark, low-lightness accent (mirroring what broke on-device: a Material You accent
		// whose extracted tone sat too close to the dialog surface's lightness once elevation
		// overlay was in play) paired with a card background from the same dark neutral family.
		const response: MaterialYouResponse = {
			supported: true,
			apiLevel: 34,
			palettes: {
				system_accent1: { '600': '#2a2a3a' },
				system_neutral1: { '900': '#121212', '800': '#1a1a1a', '100': '#f4f5f8' },
			},
		};

		const theme = generateSystemTheme(true, response);
		expect(
			getContrastRatio(theme.muiPalette.primary.main, theme.muiPalette.background.paper),
		).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
		expect(
			getContrastRatio(theme.muiPalette.primary.contrastText, theme.muiPalette.primary.main),
		).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	describe('getContrastRatio', () => {
		it('returns 21 for black on white (WCAG maximum)', () => {
			expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
		});

		it('returns 1 for identical colours (no contrast)', () => {
			expect(getContrastRatio('#4c8dff', '#4c8dff')).toBeCloseTo(1, 5);
		});

		it('is symmetric regardless of argument order', () => {
			expect(getContrastRatio('#4c8dff', '#1a1a1a')).toBeCloseTo(
				getContrastRatio('#1a1a1a', '#4c8dff'),
				5,
			);
		});

		it('accepts hex, rgb(), and hsl() interchangeably', () => {
			const viaHex = getContrastRatio('#ff0000', '#ffffff');
			const viaRgb = getContrastRatio('rgb(255, 0, 0)', '#ffffff');
			const viaHsl = getContrastRatio('hsl(0, 100%, 50%)', '#ffffff');
			expect(viaRgb).toBeCloseTo(viaHex, 1);
			expect(viaHsl).toBeCloseTo(viaHex, 1);
		});
	});

	describe('ensureContrastAA', () => {
		it('leaves an already-compliant pairing unchanged', () => {
			expect(ensureContrastAA('#000000', '#ffffff')).toBe('#000000');
		});

		it('darkens a foreground that is too light for a light background', () => {
			const corrected = ensureContrastAA('hsl(0, 100%, 50%)', '#ffffff');
			expect(getContrastRatio(corrected, '#ffffff')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
		});

		it('lightens a foreground that is too dark for a dark background', () => {
			const corrected = ensureContrastAA('hsl(210, 100%, 20%)', '#121212');
			expect(getContrastRatio(corrected, '#121212')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
		});

		it('preserves hue while correcting', () => {
			const corrected = ensureContrastAA('hsl(0, 100%, 50%)', '#ffffff');
			expect(corrected).toMatch(/^hsl\(0, /);
		});
	});

	describe('pickContrastText', () => {
		it('picks black for a light background', () => {
			expect(pickContrastText('#ffffff')).toBe('#000000');
		});

		it('picks white for a dark background', () => {
			expect(pickContrastText('#000000')).toBe('#ffffff');
		});
	});

	describe('static theme definitions', () => {
		// Labelled by themeKey + light/dark rather than theme.id -- light/dark variants of the
		// same theme share an id (e.g. both deep-night variants are id: 'deep-night'), which
		// would otherwise print two identically-named, ambiguous test cases. Dedupes boring-
		// light/boring-dark, which intentionally reuse the same ThemeDefinition object for both
		// their light and dark slot.
		const seen = new Set<object>();
		const labelledThemes = Object.entries(themes).flatMap(([key, variants]) =>
			(['light', 'dark'] as const)
				.map((mode) => ({ label: `${key} (${mode})`, theme: variants[mode] }))
				.filter(({ theme }) => (seen.has(theme) ? false : seen.add(theme))),
		);

		it.each(labelledThemes.map(({ label, theme }) => [label, theme] as const))(
			'%s: primary.main is readable as text against background.paper',
			(_label, theme) => {
				const ratio = getContrastRatio(
					theme.muiPalette.primary.main,
					theme.muiPalette.background.paper,
				);
				expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
			},
		);

		it.each(labelledThemes.map(({ label, theme }) => [label, theme] as const))(
			'%s: text.primary is readable against background.default',
			(_label, theme) => {
				const ratio = getContrastRatio(
					theme.muiPalette.text.primary,
					theme.muiPalette.background.default,
				);
				expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
			},
		);
	});
});
