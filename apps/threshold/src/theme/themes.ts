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

// Helper to convert Hex or HSL string to HSL string
// Returns "hsl(h, s%, l%)"
function colourToHsl(colour: string): string {
    if (colour.startsWith('hsl')) return colour;
    
    let r = 0, g = 0, b = 0;
    
    // Handle Hex
    if (colour.startsWith('#')) {
        let hex = colour.replace('#', '');
        
        // Handle 8-digit hex (strip alpha for compatibility with base calc)
        if (hex.length === 8) {
             // #RRGGBBAA -> RRGGBB if it was converted by androidHexToCssHex
             // or #AARRGGBB -> RRGGBB if raw.
             // Given androidHexToCssHex is usually called first, let's assume standard CSS hex
             // but strictly for this math we just want RGB.
             if (colour.length === 9) hex = hex.substring(0, 6); 
        }

        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        }
    } else if (colour.startsWith('rgb')) {
        // Parse rgb(r, g, b)
        const parts = colour.match(/\d+/g);
        if (parts && parts.length >= 3) {
            r = parseInt(parts[0]);
            g = parseInt(parts[1]);
            b = parseInt(parts[2]);
        }
    }

    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

// Increases Lightness
function getTint(hsl: string, amount: number): string {
    const parts = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!parts) return hsl;
    
    const h = parseInt(parts[1]);
    const s = parseInt(parts[2]);
    let l = parseInt(parts[3]);
    
    l = Math.min(l + amount, 100);
    
    return `hsl(${h}, ${s}%, ${l}%)`;
}

// Decreases Lightness
function getShade(hsl: string, amount: number): string {
    const parts = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!parts) return hsl;
    
    const h = parseInt(parts[1]);
    const s = parseInt(parts[2]);
    let l = parseInt(parts[3]);
    
    l = Math.max(l - amount, 0);
    
    return `hsl(${h}, ${s}%, ${l}%)`;
}

const deepNightLight: ThemeDefinition = {
    id: 'deep-night',
    variables: {
        '--app-colour-primary': 'hsl(210, 100%, 13%)', // #002244
        '--app-colour-primary-contrast': '#ffffff',
        '--app-colour-primary-shade': 'hsl(210, 100%, 12%)', // #001e3c approx
        '--app-colour-primary-tint': 'hsl(210, 54%, 22%)', // #1a3857 approx

        '--app-colour-secondary': 'hsl(221, 83%, 53%)', // #2563eb
        '--app-colour-secondary-contrast': '#ffffff',
        '--app-colour-secondary-shade': 'hsl(224, 76%, 48%)', // #1d4ed8
        '--app-colour-secondary-tint': 'hsl(217, 91%, 60%)', // #3b82f6

        '--app-background-colour': '#f4f5f8',
        '--app-text-colour': '#1a1a1a',
        '--app-card-background': '#ffffff',
        '--app-border-colour': 'rgba(0, 0, 0, 0.12)',
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
        '--app-background-colour': '#121212',
        '--app-text-colour': '#f4f5f8',
        '--app-border-colour': 'rgba(255, 255, 255, 0.08)',
        '--app-card-background': '#1a1a1a',
        '--app-colour-step-100': '#1e1e1e',
        '--app-colour-step-200': '#2a2a2a',

        '--app-colour-primary': '#4c8dff',
        '--app-colour-primary-contrast': '#ffffff',

        '--app-colour-secondary': 'hsl(221, 83%, 53%)', // #2563eb
        '--app-colour-secondary-contrast': '#1a1a1a',
        '--app-colour-secondary-shade': 'hsl(224, 76%, 48%)',
        '--app-colour-secondary-tint': 'hsl(217, 91%, 60%)',
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
        '--app-colour-primary': 'hsl(210, 20%, 30%)',
        '--app-colour-primary-contrast': '#ffffff',
        '--app-colour-primary-shade': 'hsl(210, 20%, 26%)',
        '--app-colour-primary-tint': 'hsl(210, 20%, 38%)',

        '--app-colour-secondary': 'hsl(355, 65%, 45%)',
        '--app-colour-secondary-contrast': '#ffffff',
        '--app-colour-secondary-shade': 'hsl(355, 65%, 40%)',
        '--app-colour-secondary-tint': 'hsl(355, 65%, 55%)',

        '--app-background-colour': 'hsl(35, 30%, 94%)',
        '--app-text-colour': 'hsl(210, 20%, 20%)',
        '--app-card-background': '#ffffff',
        '--app-border-colour': 'rgba(0, 0, 0, 0.12)',
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
        '--app-background-colour': 'hsl(30, 15%, 15%)',
        '--app-text-colour': 'hsl(35, 20%, 90%)',
        '--app-border-colour': 'rgba(255, 255, 255, 0.08)',
        '--app-card-background': 'hsl(30, 15%, 20%)',
        '--app-colour-step-100': 'hsl(30, 15%, 25%)',
        '--app-colour-step-200': 'hsl(30, 15%, 30%)',
        '--app-text-colour-step-400': 'hsl(35, 10%, 70%)',

        '--app-colour-primary': 'hsl(210, 20%, 70%)',
        '--app-colour-primary-contrast': '#000000',
        '--app-colour-primary-shade': 'hsl(210, 20%, 62%)',
        '--app-colour-primary-tint': 'hsl(210, 20%, 78%)',

        '--app-colour-secondary': 'hsl(355, 65%, 45%)',
        '--app-colour-secondary-contrast': 'hsl(210, 20%, 20%)',
        '--app-colour-secondary-shade': 'hsl(355, 65%, 40%)',
        '--app-colour-secondary-tint': 'hsl(355, 65%, 55%)',

        // Special override for Canadian Cottage Segments to be RED
        '--segment-indicator-colour-override': 'var(--app-colour-secondary)',
        '--segment-checked-colour-override': '#ffffff',
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
        '--app-colour-primary': 'hsl(190, 50%, 75%)',
        '--app-colour-primary-contrast': 'hsl(210, 15%, 20%)',
        '--app-colour-primary-shade': 'hsl(190, 50%, 65%)',
        '--app-colour-primary-tint': 'hsl(190, 50%, 82%)',

        '--app-colour-secondary': 'hsl(190, 50%, 35%)',
        '--app-colour-secondary-contrast': '#ffffff',
        '--app-colour-secondary-shade': 'hsl(190, 50%, 30%)',
        '--app-colour-secondary-tint': 'hsl(190, 50%, 45%)',

        '--app-background-colour': 'hsl(210, 15%, 96%)',
        '--app-text-colour': 'hsl(210, 15%, 20%)',
        '--app-card-background': '#ffffff',
        '--app-border-colour': 'rgba(0, 0, 0, 0.12)',
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
        '--app-background-colour': 'hsl(200, 20%, 12%)',
        '--app-text-colour': 'hsl(190, 30%, 90%)',
        '--app-border-colour': 'rgba(255, 255, 255, 0.08)',
        '--app-card-background': 'hsl(200, 20%, 16%)',
        '--app-colour-step-100': 'hsl(200, 20%, 20%)',
        '--app-colour-step-200': 'hsl(200, 20%, 25%)',

        '--app-colour-primary': 'hsl(190, 50%, 75%)',
        '--app-colour-primary-contrast': 'hsl(210, 15%, 20%)',

        '--app-colour-secondary': 'hsl(190, 50%, 35%)',
        '--app-colour-secondary-contrast': 'hsl(210, 15%, 20%)',
        '--app-colour-secondary-shade': 'hsl(190, 50%, 30%)',
        '--app-colour-secondary-tint': 'hsl(190, 50%, 45%)',
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
        '--app-colour-primary': 'hsl(210, 100%, 50%)',
        '--app-colour-primary-contrast': '#ffffff',
        '--app-colour-primary-shade': 'hsl(210, 100%, 40%)',
        '--app-colour-primary-tint': 'hsl(210, 100%, 60%)',

        '--app-colour-secondary': 'hsl(0, 0%, 50%)',
        '--app-colour-secondary-contrast': '#ffffff',
        '--app-colour-secondary-shade': 'hsl(0, 0%, 40%)',
        '--app-colour-secondary-tint': 'hsl(0, 0%, 60%)',

        '--app-background-colour': '#ffffff',
        '--app-text-colour': '#000000',
        '--app-card-background': '#ffffff',
        '--app-border-colour': 'rgba(0, 0, 0, 0.12)',
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
        '--app-background-colour': 'hsl(0, 0%, 12%)',
        '--app-text-colour': 'hsl(0, 0%, 90%)',
        '--app-border-colour': 'rgba(255, 255, 255, 0.08)',
        '--app-card-background': 'hsl(0, 0%, 16%)',
        '--app-colour-step-100': 'hsl(0, 0%, 18%)',
        '--app-colour-step-200': 'hsl(0, 0%, 22%)',

        '--app-colour-primary': 'hsl(210, 100%, 50%)',
        '--app-colour-primary-contrast': '#ffffff',

        '--app-colour-secondary': 'hsl(0, 0%, 50%)',
        '--app-colour-secondary-contrast': 'hsl(0, 0%, 10%)',
        '--app-colour-secondary-shade': 'hsl(0, 0%, 40%)',
        '--app-colour-secondary-tint': 'hsl(0, 0%, 60%)',
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
    // FALLBACK: Use Deep Night as the default branded theme instead of Boring
    const base = isDark ? deepNightDark : deepNightLight;
    
    if (!response || !response.supported || !response.palettes) return base;

    const palettes = response.palettes;

    // Use tone '600' as standard accent if available, else '500', fallback to base
    const getColour = (palette: Record<string, string> | undefined, tone: string) =>
        palette && palette[tone] ? androidHexToCssHex(palette[tone]) : undefined;

    const primaryHex = getColour(palettes.system_accent1, '600')
        || getColour(palettes.system_accent1, '500');
    
    // If system primary is missing, fall back to base
    const primary = primaryHex ? colourToHsl(primaryHex) : base.variables['--app-colour-primary'];

    const secondaryHex = getColour(palettes.system_accent3, '600')
        || getColour(palettes.system_accent3, '500');

    // If system secondary is missing, fall back to base
    const secondary = secondaryHex ? colourToHsl(secondaryHex) : base.variables['--app-colour-secondary'];

    // Calculate contrasts for Primary
    const primaryContrast = '#ffffff';
    const secondaryContrast = isDark ?
        (getColour(palettes.system_neutral1, '900') || '#000000') : '#ffffff';

    const overrides: Record<string, string> = {
        '--app-colour-primary': primary,
        '--app-colour-primary-contrast': primaryContrast,
        // Calculate tints/shades for system theme
        '--app-colour-primary-tint': getTint(primary, 10),
        '--app-colour-primary-shade': getShade(primary, 10),

        '--app-colour-secondary': secondary,
        '--app-colour-secondary-contrast': secondaryContrast,
        '--app-colour-secondary-tint': getTint(secondary, 10),
        '--app-colour-secondary-shade': getShade(secondary, 10),
    };

    // Optional: Full Monet Backgrounds
    if (isDark) {
        const bg = getColour(palettes.system_neutral1, '900');
        if (bg) {
            overrides['--app-background-colour'] = bg;
            overrides['--app-card-background'] = getColour(palettes.system_neutral1, '800') || '#1e1e1e';
            overrides['--app-text-colour'] = getColour(palettes.system_neutral1, '100') || '#ffffff';
        }
    } else {
        const bg = getColour(palettes.system_neutral1, '50');
        if (bg) {
            overrides['--app-background-colour'] = bg; // Very light
            overrides['--app-card-background'] = getColour(palettes.system_neutral1, '10') || '#ffffff'; // White-ish
            overrides['--app-text-colour'] = getColour(palettes.system_neutral1, '900') || '#000000';
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
                default: overrides['--app-background-colour'] || base.muiPalette.background.default,
                paper: overrides['--app-card-background'] || base.muiPalette.background.paper,
            },
            text: {
                primary: overrides['--app-text-colour'] || base.muiPalette.text.primary,
            }
        }
    };
}
