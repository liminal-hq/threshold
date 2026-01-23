import { describe, it, expect } from 'vitest';
import { generateSystemTheme, boringLight, boringDark, MaterialYouResponse } from './themes';

describe('themes', () => {
    it('should generate system theme using boring defaults when no colours provided', () => {
        const light = generateSystemTheme(false, undefined);
        expect(light.variables['--app-colour-primary']).toBe(boringLight.variables['--app-colour-primary']);

        const dark = generateSystemTheme(true, undefined);
        expect(dark.variables['--app-colour-primary']).toBe(boringDark.variables['--app-colour-primary']);
    });

    it('should override primary/secondary with system colours', () => {
        const response: MaterialYouResponse = {
            supported: true,
            apiLevel: 34,
            palettes: {
                system_accent1: { '600': '#ff0000' },
                system_accent3: { '600': '#00ff00' }
            }
        };

        const theme = generateSystemTheme(false, response);
        expect(theme.variables['--app-colour-primary']).toBe('hsl(0, 100%, 50%)');
        expect(theme.variables['--app-colour-secondary']).toBe('hsl(120, 100%, 50%)');
    });

    it('should apply dark mode neutral overrides if provided', () => {
        const response: MaterialYouResponse = {
            supported: true,
            apiLevel: 34,
            palettes: {
                system_accent1: { '600': '#ff0000' },
                system_neutral1: { '900': '#111111' }
            }
        };

        const theme = generateSystemTheme(true, response);
        expect(theme.variables['--app-background-colour']).toBe('#111111');
    });
});
