import { createTheme, ThemeOptions } from '@mui/material/styles';
import { Theme as AppTheme } from '../services/SettingsService';

// Helper to create the theme based on name and mode
export const getMuiTheme = (themeName: AppTheme, mode: 'light' | 'dark') => {
  let themeOptions: ThemeOptions = {
    palette: {
      mode,
    },
    components: {
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none', // Disable default elevation overlay in dark mode to match flat look if needed
                }
            }
        }
    }
  };

  if (themeName === 'deep-night') {
    themeOptions = {
      ...themeOptions,
      palette: {
        ...themeOptions.palette,
        primary: {
          main: mode === 'dark' ? '#4c8dff' : '#002244',
        },
        secondary: {
          main: '#2563eb',
          contrastText: mode === 'dark' ? '#1a1a1a' : '#ffffff', // Inverse pattern: Dark text in dark mode
        },
        background: {
          default: mode === 'dark' ? '#121212' : '#f4f5f8',
          paper: mode === 'dark' ? '#1a1a1a' : '#ffffff',
        },
        text: {
            primary: mode === 'dark' ? '#f4f5f8' : '#1a1a1a',
        }
      },
    };

  } else if (themeName === 'canadian-cottage-winter') {
    themeOptions = {
      ...themeOptions,
      palette: {
        ...themeOptions.palette,
        primary: {
          main: mode === 'dark' ? 'hsl(210, 20%, 70%)' : 'hsl(210, 20%, 30%)',
        },
        secondary: {
          main: 'hsl(355, 65%, 45%)',
          contrastText: mode === 'dark' ? 'hsl(210, 20%, 20%)' : '#ffffff',
        },
        background: {
          default: mode === 'dark' ? 'hsl(30, 15%, 15%)' : 'hsl(35, 30%, 94%)',
          paper: mode === 'dark' ? 'hsl(30, 15%, 20%)' : '#ffffff',
        },
        text: {
            primary: mode === 'dark' ? 'hsl(35, 20%, 90%)' : 'hsl(210, 20%, 20%)',
        }
      },
    };
  } else if (themeName === 'georgian-bay-plunge') {
    themeOptions = {
      ...themeOptions,
      palette: {
        ...themeOptions.palette,
        primary: {
          main: 'hsl(190, 50%, 75%)',
          contrastText: 'hsl(210, 15%, 20%)',
        },
        secondary: {
          main: 'hsl(190, 50%, 35%)',
          contrastText: mode === 'dark' ? 'hsl(210, 15%, 20%)' : '#ffffff', // Inverse pattern: Dark text in dark mode
        },
        background: {
          default: mode === 'dark' ? 'hsl(200, 20%, 12%)' : 'hsl(210, 15%, 96%)',
          paper: mode === 'dark' ? 'hsl(200, 20%, 16%)' : '#ffffff',
        },
        text: {
            primary: mode === 'dark' ? 'hsl(190, 30%, 90%)' : 'hsl(210, 15%, 20%)',
        }
      },
    };
  } else if (themeName === 'boring-light') {
    // Boring Light stays light unless forced (which is handled by passing 'dark' mode)
    // If mode is dark (forced), we use the "force dark" values
    themeOptions = {
      ...themeOptions,
      palette: {
        ...themeOptions.palette,
        primary: {
          main: 'hsl(210, 100%, 50%)',
        },
        secondary: {
          main: 'hsl(0, 0%, 50%)',
          contrastText: mode === 'dark' ? 'hsl(0, 0%, 10%)' : '#ffffff', // White in light mode, dark in dark mode
        },
        background: {
          default: mode === 'dark' ? 'hsl(0, 0%, 12%)' : 'hsl(0, 0%, 100%)',
          paper: mode === 'dark' ? 'hsl(0, 0%, 16%)' : '#ffffff',
        },
        text: {
            primary: mode === 'dark' ? 'hsl(0, 0%, 90%)' : 'hsl(0, 0%, 0%)',
        }
      },
    };
  } else if (themeName === 'boring-dark') {
    themeOptions = {
      ...themeOptions,
      palette: {
        ...themeOptions.palette,
        mode: 'dark', // Always dark base
        primary: {
          main: 'hsl(210, 100%, 50%)',
        },
        secondary: {
          main: 'hsl(0, 0%, 50%)',
          contrastText: 'hsl(0, 0%, 10%)', // Dark text on gray background
        },
        background: {
          default: 'hsl(0, 0%, 12%)',
          paper: 'hsl(0, 0%, 16%)',
        },
        text: {
            primary: 'hsl(0, 0%, 90%)',
        }
      },
    };
  }

  return createTheme(themeOptions);
};
