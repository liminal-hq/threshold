export type ThemeId = 'deep-night' | 'canadian-cottage-winter' | 'georgian-bay-plunge' | 'boring-light' | 'boring-dark' | 'system';

export interface ThemeDefinition {
    id: ThemeId;
    variables: Record<string, string>;
    muiPalette: any; // Using any for flexibility in passing to createTheme
}

export interface MaterialYouResponse {
    supported: boolean;
    apiLevel: number;
    palettes: {
        system_accent1?: Record<string, string>;
        system_accent2?: Record<string, string>;
        system_accent3?: Record<string, string>;
        system_neutral1?: Record<string, string>;
        system_neutral2?: Record<string, string>;
    };
}

// Helper to generate RGB string "r, g, b" from hex
function hexToRgb(hex: string): string {
    // Handle 8-digit hex.
    // NOTE: This helper assumes the input is ALREADY converted to CSS format (#RRGGBB or #RRGGBBAA)
    // because `generateSystemTheme` runs `androidHexToCssHex` first.
    // So for 8-digit hex, we strip the LAST 2 chars (Alpha) to get RRGGBB.

    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 8) {
        // #RRGGBBAA -> RRGGBB (strip last 2 chars)
        cleanHex = cleanHex.substring(0, 6);
    }

    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
}

// Convert Android ARGB hex (#AARRGGBB) to CSS RGBA hex (#RRGGBBAA)
// If standard 6-digit hex is passed, returns as is.
function androidHexToCssHex(hex: string): string {
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length === 8) {
        // #AARRGGBB -> #RRGGBBAA
        const alpha = cleanHex.substring(0, 2);
        const rgb = cleanHex.substring(2);
        return `#${rgb}${alpha}`;
    }
    return hex;
}

// Helper to darken/lighten would be good but for now we trust the system colours or boring defaults
// We'll use a simple placeholder for dynamic generation or rely on CSS `color-mix` if supported,
// but for now let's just use the boring theme as base and override primary/secondary.

const deepNightLight: ThemeDefinition = {
    id: 'deep-night',
    variables: {
        '--ion-color-primary': '#002244',
        '--ion-color-primary-rgb': '0, 34, 68',
        '--ion-color-primary-contrast': '#ffffff',
        '--ion-color-primary-contrast-rgb': '255, 255, 255',
        '--ion-color-primary-shade': '#001e3c',
        '--ion-color-primary-tint': '#1a3857',

        '--ion-color-secondary': '#2563eb',
        '--ion-color-secondary-rgb': '37, 99, 235',
        '--ion-color-secondary-contrast': '#ffffff',
        '--ion-color-secondary-contrast-rgb': '255, 255, 255',
        '--ion-color-secondary-shade': '#1d4ed8',
        '--ion-color-secondary-tint': '#3b82f6',

        '--ion-background-color': '#f4f5f8',
        '--ion-text-color': '#1a1a1a',
        '--ion-card-background': '#ffffff',
        '--ion-border-color': 'rgba(0, 0, 0, 0.12)',
    },
    muiPalette: {
        primary: { main: '#002244' },
        secondary: { main: '#2563eb', contrastText: '#ffffff' },
        background: { default: '#f4f5f8', paper: '#ffffff' },
        text: { primary: '#1a1a1a' },
    }
};

const deepNightDark: ThemeDefinition = {
    id: 'deep-night',
    variables: {
        '--ion-background-color': '#121212',
        '--ion-text-color': '#f4f5f8',
        '--ion-border-color': 'rgba(255, 255, 255, 0.08)',
        '--ion-card-background': '#1a1a1a',
        '--ion-color-step-100': '#1e1e1e',
        '--ion-color-step-200': '#2a2a2a',

        '--ion-color-primary': '#4c8dff',
        '--ion-color-primary-contrast': '#ffffff',

        '--ion-color-secondary': '#2563eb', // Keep same base
        '--ion-color-secondary-contrast': '#1a1a1a',
        '--ion-color-secondary-contrast-rgb': '26, 26, 26',
    },
    muiPalette: {
        primary: { main: '#4c8dff' },
        secondary: { main: '#2563eb', contrastText: '#1a1a1a' },
        background: { default: '#121212', paper: '#1a1a1a' },
        text: { primary: '#f4f5f8' },
    }
};

const canadianCottageWinterLight: ThemeDefinition = {
    id: 'canadian-cottage-winter',
    variables: {
        '--ion-color-primary': 'hsl(210, 20%, 30%)',
        '--ion-color-primary-rgb': '61, 77, 92',
        '--ion-color-primary-contrast': '#ffffff',
        '--ion-color-primary-contrast-rgb': '255, 255, 255',
        '--ion-color-primary-shade': 'hsl(210, 20%, 26%)',
        '--ion-color-primary-tint': 'hsl(210, 20%, 38%)',

        '--ion-color-secondary': 'hsl(355, 65%, 45%)',
        '--ion-color-secondary-rgb': '189, 40, 52',
        '--ion-color-secondary-contrast': '#ffffff',
        '--ion-color-secondary-contrast-rgb': '255, 255, 255',
        '--ion-color-secondary-shade': 'hsl(355, 65%, 40%)',
        '--ion-color-secondary-tint': 'hsl(355, 65%, 55%)',

        '--ion-background-color': 'hsl(35, 30%, 94%)',
        '--ion-text-color': 'hsl(210, 20%, 20%)',
        '--ion-card-background': '#ffffff',
        '--ion-border-color': 'rgba(0, 0, 0, 0.12)',
    },
    muiPalette: {
        primary: { main: 'hsl(210, 20%, 30%)' },
        secondary: { main: 'hsl(355, 65%, 45%)', contrastText: '#ffffff' },
        background: { default: 'hsl(35, 30%, 94%)', paper: '#ffffff' },
        text: { primary: 'hsl(210, 20%, 20%)' },
    }
};

const canadianCottageWinterDark: ThemeDefinition = {
    id: 'canadian-cottage-winter',
    variables: {
        '--ion-background-color': 'hsl(30, 15%, 15%)',
        '--ion-text-color': 'hsl(35, 20%, 90%)',
        '--ion-border-color': 'rgba(255, 255, 255, 0.08)',
        '--ion-card-background': 'hsl(30, 15%, 20%)',
        '--ion-color-step-100': 'hsl(30, 15%, 25%)',
        '--ion-color-step-200': 'hsl(30, 15%, 30%)',
        '--ion-text-color-step-400': 'hsl(35, 10%, 70%)',

        '--ion-color-primary': 'hsl(210, 20%, 70%)',
        '--ion-color-primary-rgb': '178, 194, 209',
        '--ion-color-primary-contrast': '#000000',
        '--ion-color-primary-contrast-rgb': '0, 0, 0',
        '--ion-color-primary-shade': 'hsl(210, 20%, 62%)',
        '--ion-color-primary-tint': 'hsl(210, 20%, 78%)',

        '--ion-color-secondary': 'hsl(355, 65%, 45%)', // Inherited implicitly in CSS but explicit here
        '--ion-color-secondary-contrast': 'hsl(210, 20%, 20%)',
        '--ion-color-secondary-contrast-rgb': '43, 50, 56',

        // Special override for Canadian Cottage Segments to be RED
        // We can't easily target a specific child component via global vars unless we use a global style block
        // or a specific variable that the component uses.
        // The original CSS used: `body.theme... ion-segment... { ... }`
        // We will need to inject a <style> tag for these specific overrides in the provider,
        // or handle it via a new variable like `--segment-indicator-color-override`.
        '--segment-indicator-color-override': 'var(--ion-color-secondary)',
        '--segment-checked-color-override': '#ffffff',
    },
    muiPalette: {
        primary: { main: 'hsl(210, 20%, 70%)', contrastText: '#000000' },
        secondary: { main: 'hsl(355, 65%, 45%)', contrastText: 'hsl(210, 20%, 20%)' },
        background: { default: 'hsl(30, 15%, 15%)', paper: 'hsl(30, 15%, 20%)' },
        text: { primary: 'hsl(35, 20%, 90%)' },
    }
};

const georgianBayPlungeLight: ThemeDefinition = {
    id: 'georgian-bay-plunge',
    variables: {
        '--ion-color-primary': 'hsl(190, 50%, 75%)',
        '--ion-color-primary-rgb': '141, 209, 217',
        '--ion-color-primary-contrast': 'hsl(210, 15%, 20%)',
        '--ion-color-primary-contrast-rgb': '43, 50, 56',
        '--ion-color-primary-shade': 'hsl(190, 50%, 65%)',
        '--ion-color-primary-tint': 'hsl(190, 50%, 82%)',

        '--ion-color-secondary': 'hsl(190, 50%, 35%)',
        '--ion-color-secondary-rgb': '45, 122, 140',
        '--ion-color-secondary-contrast': '#ffffff',
        '--ion-color-secondary-contrast-rgb': '255, 255, 255',
        '--ion-color-secondary-shade': 'hsl(190, 50%, 30%)',
        '--ion-color-secondary-tint': 'hsl(190, 50%, 45%)',

        '--ion-background-color': 'hsl(210, 15%, 96%)',
        '--ion-text-color': 'hsl(210, 15%, 20%)',
        '--ion-card-background': '#ffffff',
        '--ion-border-color': 'rgba(0, 0, 0, 0.12)',
    },
    muiPalette: {
        primary: { main: 'hsl(190, 50%, 75%)', contrastText: 'hsl(210, 15%, 20%)' },
        secondary: { main: 'hsl(190, 50%, 35%)', contrastText: '#ffffff' },
        background: { default: 'hsl(210, 15%, 96%)', paper: '#ffffff' },
        text: { primary: 'hsl(210, 15%, 20%)' },
    }
};

const georgianBayPlungeDark: ThemeDefinition = {
    id: 'georgian-bay-plunge',
    variables: {
        '--ion-background-color': 'hsl(200, 20%, 12%)',
        '--ion-text-color': 'hsl(190, 30%, 90%)',
        '--ion-border-color': 'rgba(255, 255, 255, 0.08)',
        '--ion-card-background': 'hsl(200, 20%, 16%)',
        '--ion-color-step-100': 'hsl(200, 20%, 20%)',
        '--ion-color-step-200': 'hsl(200, 20%, 25%)',

        '--ion-color-primary': 'hsl(190, 50%, 75%)', // Inherited from light
        '--ion-color-primary-contrast': 'hsl(210, 15%, 20%)',

        '--ion-color-secondary': 'hsl(190, 50%, 35%)',
        '--ion-color-secondary-contrast': 'hsl(210, 15%, 20%)',
        '--ion-color-secondary-contrast-rgb': '43, 50, 56',
    },
    muiPalette: {
        primary: { main: 'hsl(190, 50%, 75%)', contrastText: 'hsl(210, 15%, 20%)' },
        secondary: { main: 'hsl(190, 50%, 35%)', contrastText: 'hsl(210, 15%, 20%)' },
        background: { default: 'hsl(200, 20%, 12%)', paper: 'hsl(200, 20%, 16%)' },
        text: { primary: 'hsl(190, 30%, 90%)' },
    }
};

export const boringLight: ThemeDefinition = {
    id: 'boring-light',
    variables: {
        '--ion-color-primary': 'hsl(210, 100%, 50%)',
        '--ion-color-primary-rgb': '0, 128, 255',
        '--ion-color-primary-contrast': '#ffffff',
        '--ion-color-primary-contrast-rgb': '255, 255, 255',
        '--ion-color-primary-shade': 'hsl(210, 100%, 40%)',
        '--ion-color-primary-tint': 'hsl(210, 100%, 60%)',

        '--ion-color-secondary': 'hsl(0, 0%, 50%)',
        '--ion-color-secondary-rgb': '128, 128, 128',
        '--ion-color-secondary-contrast': '#ffffff',
        '--ion-color-secondary-contrast-rgb': '255, 255, 255',
        '--ion-color-secondary-shade': 'hsl(0, 0%, 40%)',
        '--ion-color-secondary-tint': 'hsl(0, 0%, 60%)',

        '--ion-background-color': '#ffffff',
        '--ion-text-color': '#000000',
        '--ion-card-background': '#ffffff',
        '--ion-border-color': 'rgba(0, 0, 0, 0.12)',
    },
    muiPalette: {
        primary: { main: 'hsl(210, 100%, 50%)' },
        secondary: { main: 'hsl(0, 0%, 50%)', contrastText: '#ffffff' },
        background: { default: '#ffffff', paper: '#ffffff' },
        text: { primary: '#000000' },
    }
};

export const boringDark: ThemeDefinition = {
    id: 'boring-dark',
    variables: {
        '--ion-background-color': 'hsl(0, 0%, 12%)',
        '--ion-text-color': 'hsl(0, 0%, 90%)',
        '--ion-border-color': 'rgba(255, 255, 255, 0.08)',
        '--ion-card-background': 'hsl(0, 0%, 16%)',
        '--ion-color-step-100': 'hsl(0, 0%, 18%)',
        '--ion-color-step-200': 'hsl(0, 0%, 22%)',

        '--ion-color-primary': 'hsl(210, 100%, 50%)',
        '--ion-color-primary-contrast': '#ffffff',

        '--ion-color-secondary': 'hsl(0, 0%, 50%)',
        '--ion-color-secondary-contrast': 'hsl(0, 0%, 10%)',
        '--ion-color-secondary-contrast-rgb': '26, 26, 26',
    },
    muiPalette: {
        primary: { main: 'hsl(210, 100%, 50%)' },
        secondary: { main: 'hsl(0, 0%, 50%)', contrastText: 'hsl(0, 0%, 10%)' },
        background: { default: 'hsl(0, 0%, 12%)', paper: 'hsl(0, 0%, 16%)' },
        text: { primary: 'hsl(0, 0%, 90%)' },
    }
};

export const themes = {
    'deep-night': { light: deepNightLight, dark: deepNightDark },
    'canadian-cottage-winter': { light: canadianCottageWinterLight, dark: canadianCottageWinterDark },
    'georgian-bay-plunge': { light: georgianBayPlungeLight, dark: georgianBayPlungeDark },
    'boring-light': { light: boringLight, dark: boringLight }, // No dark variant for explicit light theme
    'boring-dark': { light: boringDark, dark: boringDark }, // No light variant for explicit dark theme
};

export function generateSystemTheme(isDark: boolean, response?: MaterialYouResponse): ThemeDefinition {
    const base = isDark ? boringDark : boringLight;
    if (!response || !response.supported || !response.palettes) return base;

    const palettes = response.palettes;

    // Map system colours to theme variables
    // Use tone '600' as standard accent if available, else '500', fallback to base

    // Safety helpers
    // Uses androidHexToCssHex to ensure any ARGB colours from plugin are converted to RGBA
    const getColour = (palette: Record<string, string> | undefined, tone: string) =>
        palette && palette[tone] ? androidHexToCssHex(palette[tone]) : undefined;

    const primary = getColour(palettes.system_accent1, '600')
        || getColour(palettes.system_accent1, '500')
        || base.variables['--ion-color-primary'];

    const secondary = getColour(palettes.system_accent3, '600')
        || getColour(palettes.system_accent3, '500')
        || base.variables['--ion-color-secondary'];

    // Calculate contrasts for Primary
    // (Simplification: Use white/black based on mode, or hardcode white for these saturated accents)
    const primaryContrast = '#ffffff';
    const secondaryContrast = isDark ?
        (getColour(palettes.system_neutral1, '900') || '#000000') : '#ffffff';

    const overrides: Record<string, string> = {
        '--ion-color-primary': primary,
        '--ion-color-primary-rgb': hexToRgb(primary),
        '--ion-color-primary-contrast': primaryContrast,
        '--ion-color-primary-contrast-rgb': hexToRgb(primaryContrast),
        // Shades/Tints skipped for now, would need color lib

        '--ion-color-secondary': secondary,
        '--ion-color-secondary-rgb': hexToRgb(secondary),
        '--ion-color-secondary-contrast': secondaryContrast,
        '--ion-color-secondary-contrast-rgb': hexToRgb(secondaryContrast),
    };

    // Optional: Full Monet Backgrounds
    // If we want to use system_neutral1 for backgrounds
    if (isDark) {
        const bg = getColour(palettes.system_neutral1, '900');
        if (bg) {
            overrides['--ion-background-color'] = bg;
            overrides['--ion-card-background'] = getColour(palettes.system_neutral1, '800') || '#1e1e1e';
            overrides['--ion-text-color'] = getColour(palettes.system_neutral1, '100') || '#ffffff';
        }
    } else {
        const bg = getColour(palettes.system_neutral1, '50');
        if (bg) {
            overrides['--ion-background-color'] = bg; // Very light
            overrides['--ion-card-background'] = getColour(palettes.system_neutral1, '10') || '#ffffff'; // White-ish
            overrides['--ion-text-color'] = getColour(palettes.system_neutral1, '900') || '#000000';
        }
    }

    return {
        id: 'system',
        variables: { ...base.variables, ...overrides },
        muiPalette: {
            ...base.muiPalette,
            primary: { main: primary },
            secondary: { main: secondary, contrastText: secondaryContrast },
            background: {
                default: overrides['--ion-background-color'] || base.muiPalette.background.default,
                paper: overrides['--ion-card-background'] || base.muiPalette.background.paper,
            },
            text: {
                primary: overrides['--ion-text-color'] || base.muiPalette.text.primary,
            }
        }
    };
}
