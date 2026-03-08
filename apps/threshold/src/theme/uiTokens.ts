// Shared UI token constants for the redesign
// All values reference MUI theme spacing or are unitless multipliers.
// Colours are never hardcoded here — use palette roles at call site.

export const UI = {
  card: {
    borderRadius: '14px',       // Alarm card corner radius
    accentRailWidth: '6px',     // Left accent rail on alarm cards
    mobilePadding: 2,           // MUI spacing units (px = * 8)
  },
  banner: {
    borderRadius: '14px',
  },
  footer: {
    height: 56,                 // px — desktop bottom action bar height
  },
} as const;
