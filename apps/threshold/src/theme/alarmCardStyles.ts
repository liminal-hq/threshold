import { SxProps, Theme } from '@mui/material/styles';
import { UI } from './uiTokens';

// Returns sx for the card container — enabled/disabled drives accent rail colour.
export function alarmCardSx(_enabled: boolean, isMobile: boolean): SxProps<Theme> {
  return {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: isMobile ? UI.card.borderRadius : undefined,
    boxShadow: isMobile ? 'none' : undefined,
    bgcolor: 'background.paper',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    p: 2,
    mb: isMobile ? 0 : undefined,
    borderBottom: isMobile ? 'none' : undefined,
  };
}

// Returns sx for the left accent rail Box.
export function accentRailSx(enabled: boolean): SxProps<Theme> {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: UI.card.accentRailWidth,
    bgcolor: enabled ? 'primary.main' : 'action.disabled',
    pointerEvents: 'none',
  };
}
