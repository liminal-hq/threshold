import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => {
	const config = {
		plugins: [react()],
		resolve: {
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
			host: host || false,
			hmr: host
				? {
						protocol: 'ws',
						host,
						port: 1421,
					}
				: undefined,
			watch: {
				// 3. tell Vite to ignore watching `src-tauri`
				ignored: ['**/src-tauri/**'],
			},
		},
	};

	if (process.env.MOCK_TAURI === 'true') {
		console.log('Using Tauri Mocks');
		config.resolve.alias = {
			...config.resolve.alias,
			'@tauri-apps/api/core': path.resolve(__dirname, 'src/mocks/tauri-api-core.ts'),
			'@tauri-apps/plugin-os': path.resolve(__dirname, 'src/mocks/tauri-plugin-os.ts'),
			'@tauri-apps/api/window': path.resolve(__dirname, 'src/mocks/tauri-api-window.ts'),
			'@tauri-apps/api/path': path.resolve(__dirname, 'src/mocks/tauri-api-path.ts'),
			'@tauri-apps/plugin-sql': path.resolve(__dirname, 'src/mocks/tauri-plugin-sql.ts'),
		};
	}

	return config;
});
