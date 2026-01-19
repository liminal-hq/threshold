# Threshold Theming System

The application uses a robust theming system built on CSS Variables and Material UI (MUI). It supports multiple themes, each with Light and Dark variants, and features real-time dynamic updates.

## Available Themes

1.  **Deep Night** (Default)
    *   *Concept*: Professional, deep blues and dark greys.
    *   *Light Mode*: High contrast, clean white backgrounds.
    *   *Dark Mode*: Immersive deep blue/black palette.

2.  **Canadian Cottage Winter**
    *   *Concept*: Warm, cozy, "plaid" aesthetic.
    *   *Primary*: Wood/Earth tones.
    *   *Secondary*: **Vibrant Red**.
    *   *Features*: Custom Red segmented controls to match the secondary colour.

3.  **Georgian Bay Plunge**
    *   *Concept*: Refreshing, cold water aesthetic.
    *   *Primary*: Light Teal/Turquoise.
    *   *Secondary*: **Deep Teal**.
    *   *Features*: White text on controls for better visibility against teal.

4.  **Boring Light / Dark**
    *   *Concept*: Standard OS-like gray/blue themes.
    *   *Light*: Pure white/gray.
    *   *Dark*: Standard dark mode gray.

## Ringing Window Theming Pattern

The "Ringing" window (alarm active screen) follows a specific **Inverse Contrast Pattern** to differentiate Light and Dark modes while ensuring legibility on coloured backgrounds.

This is critical because themes like *Georgian Bay Plunge* and *Deep Night* maintain their saturated secondary colour backgrounds in both Light and Dark modes.

### The Inverse Pattern

| Element | Light Mode | Dark Mode | logic |
| :--- | :--- | :--- | :--- |
| **Page Text** | **White** (`#ffffff`) | **Dark** (Theme Dark Text) | Inverts based on system mode |
| **Stop Button BG** | **White** | **Dark** | Follows text colour |
| **Stop Button Text** | **Secondary Colour** | **Secondary Colour** | Matches page background |

**Implementation Rules:**
- **CSS**: The `--ion-color-secondary-contrast` variable controls the page text colour.
  - In `variables.css`, the base theme sets this to **White**.
  - In `@media (prefers-color-scheme: dark)`, this variable is overridden to the theme's **Dark Text Colour** (e.g., `#1a1a1a`).
- **MUI**: The `secondary.contrastText` palette value mirrors the CSS variable.
  - Button background uses `secondary.contrastText`.
  - Button text uses `secondary.main`.

### Adding a New Theme

1.  **Define CSS Variables** in `src/theme/variables.css`:
    ```css
    body.theme-new-name {
        --ion-color-primary: ...;
        --ion-color-secondary: ...;
        --ion-color-secondary-contrast: #ffffff; /* Default to White for Ringing Window */
    }

    @media (prefers-color-scheme: dark) {
        body.theme-new-name {
            /* Override for Dark Mode Ringing Window Pattern */
            --ion-color-secondary-contrast: [DARK_TEXT_COLOUR];
        }
    }
    ```

2.  **Update MUI Theme** in `src/theme/MuiTheme.ts`:
    ```typescript
    } else if (themeName === 'new-name') {
        themeOptions = {
            // ...
            secondary: {
                main: '...',
                // Enforce Inverse Pattern
                contrastText: mode === 'dark' ? '[DARK_TEXT_COLOUR]' : '#ffffff',
            }
        }
    }
    ```

## Dynamic Updates

The app uses `SettingsService` and Tauri events to sync theme changes across windows instantly.

- **Event**: `theme-changed`
- **Payload**: `{ theme: Theme, forceDark: boolean }`
- **Listener**: `Ringing.tsx` listens and updates state immediately.
