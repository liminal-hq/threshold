import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { IonIcon } from '@ionic/react';
import { closeOutline, removeOutline, squareOutline } from 'ionicons/icons';

const TitleBar: React.FC = () => {
  const [appWindow, setAppWindow] = useState<any>(null);

  useEffect(() => {
    // Import dynamically or safely use window.__TAURI__ if available,
    // but recommended v2 way is @tauri-apps/api/window
    // Since we are in a pure react env, we can try to get the current window.
    // NOTE: This might fail in browser preview, so we wrap in try-catch or check.
    try {
        const win = getCurrentWindow();
        setAppWindow(win);
    } catch (e) {
        console.warn("Not running in Tauri", e);
    }
  }, []);

  if (!appWindow) return null; // Don't render in browser if logic fails

  return (
    <div data-tauri-drag-region style={{
      height: '30px',
      background: 'var(--ion-color-primary)',
      color: 'white',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingLeft: '10px',
      userSelect: 'none',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999
    }}>
      <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Window Alarm</div>
      <div style={{ display: 'flex' }}>
        <div
          onClick={() => appWindow.minimize()}
          style={{ padding: '5px 10px', cursor: 'pointer' }}
        >
          <IonIcon icon={removeOutline} />
        </div>
        <div
          onClick={() => appWindow.toggleMaximize()}
          style={{ padding: '5px 10px', cursor: 'pointer' }}
        >
          <IonIcon icon={squareOutline} style={{ fontSize: '10px' }} />
        </div>
        <div
          onClick={() => appWindow.close()}
          style={{ padding: '5px 10px', cursor: 'pointer', background: '#c42b1c' }}
        >
          <IonIcon icon={closeOutline} />
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
