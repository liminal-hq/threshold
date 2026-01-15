export type Theme = 'deep-night' | 'canadian-cottage';

const KEY_THEME = 'window_alarm_theme';
const KEY_24H = 'window_alarm_24h';

export const SettingsService = {
  getTheme: (): Theme => {
    return (localStorage.getItem(KEY_THEME) as Theme) || 'deep-night';
  },

  setTheme: (theme: Theme) => {
    localStorage.setItem(KEY_THEME, theme);
    document.body.className = \`theme-\${theme}\`;
  },

  getIs24h: (): boolean => {
    return localStorage.getItem(KEY_24H) === 'true';
  },

  setIs24h: (is24h: boolean) => {
    localStorage.setItem(KEY_24H, String(is24h));
  },

  // Apply on startup
  applyTheme: () => {
    const theme = SettingsService.getTheme();
    document.body.className = \`theme-\${theme}\`;
  }
};
