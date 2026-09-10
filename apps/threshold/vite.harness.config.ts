// Throwaway Vite config for the screenshot harness in dev-harness/ -- serves the real app
// source with the Tauri IPC mocked, so screens render in a plain browser
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Usage: pnpm --filter threshold exec vite --config vite.harness.config.ts
// Then open http://localhost:1430/dev-harness/index.html?seed=empty (or ?seed=populated)

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
	plugins: [react()],
	resolve: {
		// Same "source" condition as the real vite.config.ts so workspace plugin packages resolve
		// to their guest-js/ TypeScript rather than an unbuilt dist-js/.
		conditions: ['source', 'import', 'module', 'browser', 'default'],
		alias: {
			history: path.resolve(__dirname, 'node_modules/history/index.js'),
			// The vendored notification plugin ships no dist-js/ in a fresh checkout; point straight
			// at its TypeScript source so Vite compiles it on the fly.
			'@tauri-apps/plugin-notification': path.resolve(
				__dirname,
				'../../vendor/tauri-plugins-workspace/plugins/notification/guest-js/index.ts',
			),
		},
	},
	clearScreen: false,
	server: {
		port: 1430,
		strictPort: true,
		host: '127.0.0.1',
		watch: {
			ignored: ['**/src-tauri/**'],
		},
	},
});
