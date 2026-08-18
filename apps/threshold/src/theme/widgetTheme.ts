// Maps a resolved theme's light and dark variants to the home-screen widget's colour roles
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { ThemeDefinition, ensureContrastAA } from './themes';

// The eight colour roles the Android home-screen widget draws with. Every value is a lowercase
// `#rrggbb` hex string -- the widget renders outside the webview, so it has no CSS engine to
// resolve `rgba()`/`hsl()`/theme variables, and no alpha channel to composite against whatever
// happens to sit underneath it on the home screen.
export interface WidgetPalette {
	fill: string;
	stroke: string;
	rail: string;
	eyebrow: string;
	time: string;
	label: string;
	railMuted: string;
	textMuted: string;
}

// The palette pushed to Rust on every theme application -- both modes at once, since the widget
// (like the OS host surface it lives on) can flip between light and dark independently of
// whatever mode the webview itself is currently rendering.
export interface WidgetThemePalettes {
	light: WidgetPalette;
	dark: WidgetPalette;
}

// MUI's own built-in defaults for the palette slots this codebase's ThemeDefinitions never
// override (text.secondary, text.disabled, action.disabled) -- reproduced here rather than
// constructing a full MUI theme just to read them back, since this module only ever receives
// the raw ThemeDefinition, not a created theme.
const DEFAULT_TEXT_SECONDARY: Record<'light' | 'dark', string> = {
	light: 'rgba(0, 0, 0, 0.6)',
	dark: 'rgba(255, 255, 255, 0.7)',
};
const DEFAULT_TEXT_DISABLED: Record<'light' | 'dark', string> = {
	light: 'rgba(0, 0, 0, 0.38)',
	dark: 'rgba(255, 255, 255, 0.5)',
};
const DEFAULT_ACTION_DISABLED: Record<'light' | 'dark', string> = {
	light: 'rgba(0, 0, 0, 0.26)',
	dark: 'rgba(255, 255, 255, 0.3)',
};
const DEFAULT_BORDER: Record<'light' | 'dark', string> = {
	light: 'rgba(0, 0, 0, 0.12)',
	dark: 'rgba(255, 255, 255, 0.08)',
};

// Converts h/s/l (degrees, 0-100%) to 0-255 RGB channels. A private copy of themes.ts's own
// helper -- that one is not exported, and this module needs the alpha-aware colour handling
// below anyway, which themes.ts has no equivalent of.
function hslToRgbChannels(h: number, s: number, l: number): { r: number; g: number; b: number } {
	const sFraction = s / 100;
	const lFraction = l / 100;
	const c = (1 - Math.abs(2 * lFraction - 1)) * sFraction;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = lFraction - c / 2;

	let rPrime = 0,
		gPrime = 0,
		bPrime = 0;
	if (h < 60) [rPrime, gPrime, bPrime] = [c, x, 0];
	else if (h < 120) [rPrime, gPrime, bPrime] = [x, c, 0];
	else if (h < 180) [rPrime, gPrime, bPrime] = [0, c, x];
	else if (h < 240) [rPrime, gPrime, bPrime] = [0, x, c];
	else if (h < 300) [rPrime, gPrime, bPrime] = [x, 0, c];
	else [rPrime, gPrime, bPrime] = [c, 0, x];

	return {
		r: Math.round((rPrime + m) * 255),
		g: Math.round((gPrime + m) * 255),
		b: Math.round((bPrime + m) * 255),
	};
}

// Parses any colour format the theme definitions use (hex/#rgb/#rrggbb/#rrggbbaa, rgb()/rgba(),
// hsl()/hsla()) into 0-255 RGB channels plus a 0-1 alpha, defaulting to opaque black on anything
// unrecognised.
function parseColourWithAlpha(colour: string): { r: number; g: number; b: number; a: number } {
	const trimmed = colour.trim();

	if (trimmed.startsWith('#')) {
		let hex = trimmed.slice(1);
		if (hex.length === 3 || hex.length === 4) {
			hex = hex
				.split('')
				.map((c) => c + c)
				.join('');
		}
		const r = parseInt(hex.slice(0, 2), 16) || 0;
		const g = parseInt(hex.slice(2, 4), 16) || 0;
		const b = parseInt(hex.slice(4, 6), 16) || 0;
		const a = hex.length === 8 ? (parseInt(hex.slice(6, 8), 16) || 0) / 255 : 1;
		return { r, g, b, a };
	}

	if (trimmed.startsWith('rgb')) {
		const parts = trimmed.match(/[\d.]+/g) ?? [];
		return {
			r: Math.round(Number(parts[0] ?? 0)),
			g: Math.round(Number(parts[1] ?? 0)),
			b: Math.round(Number(parts[2] ?? 0)),
			a: parts[3] !== undefined ? Number(parts[3]) : 1,
		};
	}

	if (trimmed.startsWith('hsl')) {
		const parts = trimmed.match(
			/hsla?\(\s*([\d.]+)[, ]+\s*([\d.]+)%[, ]+\s*([\d.]+)%(?:[, ]+([\d.]+))?\)/,
		);
		if (parts) {
			const { r, g, b } = hslToRgbChannels(Number(parts[1]), Number(parts[2]), Number(parts[3]));
			return { r, g, b, a: parts[4] !== undefined ? Number(parts[4]) : 1 };
		}
	}

	return { r: 0, g: 0, b: 0, a: 1 };
}

function toHexString(r: number, g: number, b: number): string {
	const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)));
	return `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, '0')).join('')}`;
}

// Flattens `colour` to an opaque lowercase `#rrggbb`, alpha-compositing it over `background`
// first when it carries transparency (theme border/disabled colours are usually semi-transparent
// rgba()/hsla() overlays, which the widget -- rendered by RemoteViews, not a CSS engine -- has no
// way to composite itself).
function toOpaqueHex(colour: string, background: string): string {
	const fg = parseColourWithAlpha(colour);
	if (fg.a >= 1) return toHexString(fg.r, fg.g, fg.b);

	const bg = parseColourWithAlpha(background);
	const r = fg.r * fg.a + bg.r * (1 - fg.a);
	const g = fg.g * fg.a + bg.g * (1 - fg.a);
	const b = fg.b * fg.a + bg.b * (1 - fg.a);
	return toHexString(r, g, b);
}

// Maps one resolved theme variant (light or dark) to the widget's eight roles.
function paletteForVariant(def: ThemeDefinition, mode: 'light' | 'dark'): WidgetPalette {
	// The card surface the widget's own card is meant to echo.
	const fill = toOpaqueHex(def.muiPalette.background.paper, '#ffffff');

	const stroke = toOpaqueHex(def.variables['--app-border-colour'] ?? DEFAULT_BORDER[mode], fill);

	const railMuted = toOpaqueHex(DEFAULT_ACTION_DISABLED[mode], fill);
	const textMuted = toOpaqueHex(DEFAULT_TEXT_DISABLED[mode], fill);

	// Rail echoes the alarm card's own accent rail (primary.main -- see accentRailSx in
	// alarmCardStyles.ts). Eyebrow uses secondary.main as the closest existing "accent" role,
	// since there is no dedicated eyebrow semantic elsewhere in the app to borrow from. Time and
	// label mirror text.primary/text.secondary. All four are pushed to a native surface with no
	// contrast tooling of its own, so they are corrected for WCAG AA here rather than trusting
	// each theme's hand-tuned values to still clear it once flattened to a plain hex fill.
	// ensureContrastAA returns an hsl() string when it has to nudge lightness, so its output is
	// re-flattened to opaque hex just like the raw theme colours above.
	const toRoleHex = (raw: string) =>
		toOpaqueHex(ensureContrastAA(toOpaqueHex(raw, fill), fill), fill);

	const rail = toRoleHex(def.muiPalette.primary.main);
	const eyebrow = toRoleHex(def.muiPalette.secondary.main);
	const time = toRoleHex(def.muiPalette.text.primary);
	const label = toRoleHex(def.muiPalette.text.secondary ?? DEFAULT_TEXT_SECONDARY[mode]);

	return { fill, stroke, rail, eyebrow, time, label, railMuted, textMuted };
}

// Pure mapping from a theme's resolved light and dark variants to the widget's colour palette
// for both modes at once. Callers resolve `light`/`dark` themselves -- for the six static themes
// that's `themes[id].light`/`.dark` directly; for Material You / system it's two calls into
// `generateSystemTheme` (isDark: false and true) with the same wallpaper response.
export function computeWidgetTheme(
	light: ThemeDefinition,
	dark: ThemeDefinition,
): WidgetThemePalettes {
	return {
		light: paletteForVariant(light, 'light'),
		dark: paletteForVariant(dark, 'dark'),
	};
}
