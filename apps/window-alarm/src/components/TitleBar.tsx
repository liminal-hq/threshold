import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WindowMinimizeIcon, WindowMaximizeIcon, WindowCloseIcon, WindowRestoreIcon } from './Icons';
import './TitleBar.css';

export const TitleBar: React.FC = () => {
    const [platform, setPlatform] = useState<'mac' | 'linux' | 'win'>('win');
    const [isMaximized, setIsMaximized] = useState(false);
    const [appWindow, setAppWindow] = useState<any>(null);

    useEffect(() => {
        // Safe access to window object for SSR/Browser checks
        try {
            const win = getCurrentWindow();
            setAppWindow(win);

            const updateState = async () => {
                try {
                    setIsMaximized(await win.isMaximized());
                } catch (e) {
                    console.error("Failed to check window state", e);
                }
            };

            updateState();
            const unlistenPromise = win.listen('tauri://resize', updateState);
            return () => { unlistenPromise.then(unlisten => unlisten()); };

        } catch (e) {
            console.warn("Not running in Tauri context");
        }

        const ua = navigator.userAgent;
        if (ua.includes('Mac')) {
            setPlatform('mac');
        } else if (ua.includes('Linux')) {
            setPlatform('linux');
        } else {
            setPlatform('win');
        }
    }, []);

    if (!appWindow) return null;

    const minimize = () => appWindow.minimize();
    const toggleMaximize = async () => {
        await appWindow.toggleMaximize();
        setIsMaximized(await appWindow.isMaximized());
    };
    const close = () => appWindow.close();

    // Mac Traffic Lights
    const MacControls = () => (
        <div className="window-controls mac">
            <button onClick={close} className="control-button mac-close" title="Close" />
            <button onClick={minimize} className="control-button mac-minimize" title="Minimize" />
            <button onClick={toggleMaximize} className="control-button mac-maximize" title="Maximize" />
        </div>
    );

    // Windows Controls
    const WinControls = () => (
        <div className="window-controls win">
            <button onClick={minimize} className="control-button win-minimize" title="Minimize">
                <WindowMinimizeIcon />
            </button>
            <button onClick={toggleMaximize} className="control-button win-maximize" title={isMaximized ? "Restore" : "Maximize"}>
                {isMaximized ? <WindowRestoreIcon /> : <WindowMaximizeIcon />}
            </button>
            <button onClick={close} className="control-button win-close" title="Close">
                <WindowCloseIcon />
            </button>
        </div>
    );

    // Linux Controls (Simple fallback for now)
    const LinuxControls = () => (
        <div className="window-controls win">
            <button onClick={minimize} className="control-button win-minimize" title="Minimize">
                <WindowMinimizeIcon />
            </button>
            <button onClick={toggleMaximize} className="control-button win-maximize" title={isMaximized ? "Restore" : "Maximize"}>
                {isMaximized ? <WindowRestoreIcon /> : <WindowMaximizeIcon />}
            </button>
            <button onClick={close} className="control-button win-close" title="Close">
                <WindowCloseIcon />
            </button>
        </div>
    );

    return (
        <div className={`title-bar is-${platform}`}>
            {platform === 'mac' && (
                <>
                    <MacControls />
                    <div className="title-drag-region" data-tauri-drag-region />
                    <div className="app-title" data-tauri-drag-region>Window Alarm</div>
                    <div className="title-drag-region" data-tauri-drag-region />
                    <div className="window-controls-placeholder" />
                </>
            )}

            {platform === 'linux' && (
                <>
                    <div className="app-title left" data-tauri-drag-region>Window Alarm</div>
                    <div className="title-drag-region" data-tauri-drag-region />
                    <LinuxControls />
                </>
            )}

            {platform === 'win' && (
                <>
                    <div className="app-title left" data-tauri-drag-region>Window Alarm</div>
                    <div className="title-drag-region" data-tauri-drag-region />
                    <WinControls />
                </>
            )}
        </div>
    );
};

export default TitleBar;
