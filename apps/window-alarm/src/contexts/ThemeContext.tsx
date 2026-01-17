import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { useMediaQuery, CssBaseline } from '@mui/material';
import { SettingsService, Theme as AppTheme } from '../services/SettingsService';
import { getMuiTheme } from '../theme/MuiTheme';

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  forceDark: boolean;
  setForceDark: (enabled: boolean) => void;
  isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'deep-night',
  setTheme: () => {},
  forceDark: false,
  setForceDark: () => {},
  isDarkMode: false,
});

export const useThemeContext = () => useContext(ThemeContext);

export const ThemeContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(SettingsService.getTheme());
  const [forceDark, setForceDarkState] = useState<boolean>(SettingsService.getForceDark());
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  // Determine if we should be in dark mode
  const isDarkMode = useMemo(() => {
    if (forceDark) return true;
    if (theme === 'boring-dark') return true;
    if (theme === 'boring-light') return false;
    return systemPrefersDark;
  }, [forceDark, theme, systemPrefersDark]);

  // Apply changes to SettingsService (LocalStorage + Body Class)
  useEffect(() => {
    // We manually update the SettingsService state to match ours
    // Note: SettingsService.setTheme/setForceDark also writes to localStorage and calls applyTheme()
    // But to avoid infinite loops or double writes if we just called the setters, we can just call the apply logic
    // Actually, calling the setters is fine as they are synchronous and we are in a React effect.

    // However, SettingsService.setTheme writes to localStorage.
    // We should only write if it changed?
    // Let's just call the SettingsService methods when the user *actions* occur,
    // and use this effect to ensure the body class is correct.

    document.body.className = `theme-${theme} ${forceDark ? 'force-dark' : ''}`;
  }, [theme, forceDark]);

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    SettingsService.setTheme(newTheme); // Persist
  };

  const setForceDark = (enabled: boolean) => {
    setForceDarkState(enabled);
    SettingsService.setForceDark(enabled); // Persist
  };

  // Generate MUI Theme
  const muiTheme = useMemo(() => {
    return getMuiTheme(theme, isDarkMode ? 'dark' : 'light');
  }, [theme, isDarkMode]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, forceDark, setForceDark, isDarkMode }}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};
