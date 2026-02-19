import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const coreMode = process.env.THRESHOLD_CORE_MODE ?? 'source';
const useCoreSource = coreMode !== 'dist';

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [react()],
	resolve: {
		conditions: useCoreSource
			? ['source', 'import', 'module', 'browser', 'default']
			: ['import', 'module', 'browser', 'default'],
		alias: {
			history: path.resolve(__dirname, 'node_modules/history/index.js'), // Force resolution to CJS entry point
		},
	},

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: '0.0.0.0', // Listen on all interfaces
        // This 'origin' enforces where the browser believes the request came from, which can help with CORS/host checks.
        // But importantly, we need 'clientPort' in HMR.
		hmr: host
			? {
					protocol: 'ws',
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ['**/src-tauri/**'],
		},
	},
}));
