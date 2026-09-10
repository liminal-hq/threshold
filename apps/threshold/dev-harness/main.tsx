// Screenshot-harness entry point: installs the Tauri IPC mock, then mounts the real App
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Throwaway dev harness -- mirrors src/main.tsx minus initLogger (plugin-log has no IPC here).

import './tauriMock';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../src/App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
