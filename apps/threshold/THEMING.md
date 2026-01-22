# Threshold Theming System

The application uses a robust **Code-First Theming System** built on React Context, TypeScript definitions, and Material UI (MUI). It supports multiple themes, each with Light and Dark variants, dynamic "Material You" (Monet) integration on Android, and real-time updates across multiple windows.

## Architecture

The system has moved away from static CSS files (`variables.css`) to a dynamic runtime generation approach.

1.  **Themes Definition** (`apps/threshold/src/theme/themes.ts`):
    *   All themes (Deep Night, Canadian Cottage Winter, etc.) are defined as TypeScript objects.
    *   Each theme definition includes:
        *   `variables`: CSS variables (e.g., `--ion-color-primary`) injected into the DOM for web components and global styles.
        *   `muiPalette`: Material UI palette options passed to `createTheme`.

2.  **Theme Provider** (`apps/threshold/src/contexts/ThemeContext.tsx`):
    *   Serves as the central logic hub.
    *   **State Management**: Tracks the active theme ID, force dark mode preference, and Material You toggle.
    *   **System Integration**: Listens to `prefers-color-scheme` and fetches Android system colours via the `theme-utils` plugin.
    *   **Dynamic Construction**:
        *   **Explicit Theme**: Loads the defined light/dark variant from `themes.ts`.
        *   **System Theme**: Merges the "Boring" base theme with dynamic system accents (Primary/Secondary) when enabled.
    *   **Injection**: Inject CSS variables into `document.documentElement.style` and provides the generated MUI Theme to the component tree.

3.  **Tauri Plugin** (`plugins/theme-utils`):
    *   Exposes `get_material_you_colours` command.
    *   Android implementation extracts full tonal palettes for `system_accent1`, `system_neutral1`, etc. from resources (API 31+).

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

5.  **System (Material You)**
    *   *Concept*: Dynamic adaptation to OS colours.
    *   *Features*: Pulls system accents on Android 12+.

## Material You (Monet)

When "System" theme is selected on Android:
1.  The app fetches the full system palette (Accents and Neutrals) from the OS.
2.  It maps `system_accent1` (Primary) and `system_accent3` (Secondary) to the application theme.
3.  Backgrounds remain neutral (Boring theme defaults) to ensure consistent readability, unless specific high-contrast overrides are triggered.
4.  If Material You is disabled or unavailable, it falls back to the standard "Boring" theme based on the system light/dark mode.

## Dynamic Updates

The app uses `SettingsService` and Tauri events to sync theme changes across windows (e.g., Main Window and Ringing Window) instantly.

-   **Event**: `theme-changed`
-   **Payload**: `{ theme: ThemeId, forceDark: boolean }`
-   **Listener**: The `ThemeContext` listens for this event. When settings change in one window, the event is emitted, and all other windows update their state, re-generate the theme, and re-inject the new CSS variables immediately.

## Adding a New Theme

To add a new hardcoded theme:

1.  **Define the Theme** in `apps/threshold/src/theme/themes.ts`:
    *   Create a `ThemeDefinition` object for the **Light** variant.
    *   Create a `ThemeDefinition` object for the **Dark** variant.
    *   Ensure all standard CSS variables (like `--ion-color-primary`, `--ion-background-color`) are defined.
2.  **Register the Theme**:
    *   Add your new theme objects to the `themes` export in `themes.ts`.
    *   Add the new ID to the `ThemeId` type definition.
3.  **Update UI**:
    *   Add a new `<MenuItem>` to the Theme Selector in `apps/threshold/src/screens/Settings.tsx`.

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
-   **CSS Variables**: The theme generator (`themes.ts`) calculates `--ion-color-secondary-contrast` based on the mode.
    -   **Light Mode**: Defaults to White.
    -   **Dark Mode**: Defaults to the theme's Dark Text Colour (e.g., `#1a1a1a`).
-   **MUI Palette**: The `secondary.contrastText` palette value mirrors this variable.

### Canadian Spelling
All code, variables, and UI strings strictly follow Canadian spelling (e.g., `Colours`, `Centred`).
