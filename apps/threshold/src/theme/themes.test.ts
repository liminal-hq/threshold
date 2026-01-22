import { describe, it, expect } from 'vitest';
import { generateSystemTheme, boringLight, boringDark, MaterialYouResponse } from './themes';

describe('themes', () => {
    it('should generate system theme using boring defaults when no colours provided', () => {
        const light = generateSystemTheme(false, undefined);
        expect(light.variables['--ion-color-primary']).toBe(boringLight.variables['--ion-color-primary']);

        const dark = generateSystemTheme(true, undefined);
        expect(dark.variables['--ion-color-primary']).toBe(boringDark.variables['--ion-color-primary']);
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
        expect(theme.variables['--ion-color-primary']).toBe('#ff0000');
        expect(theme.variables['--ion-color-secondary']).toBe('#00ff00');
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
        expect(theme.variables['--ion-background-color']).toBe('#111111');
    });
});
