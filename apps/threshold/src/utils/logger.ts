// Bridges browser console output to Tauri plugin-log with safe argument serialisation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { warn, debug, info, error } from '@tauri-apps/plugin-log';

function serialiseConsoleArg(arg: unknown): string {
	if (typeof arg === 'string') return arg;
	if (typeof arg === 'number' || typeof arg === 'boolean' || arg === null || arg === undefined) {
		return String(arg);
	}
	if (typeof arg === 'bigint') {
		return `${arg.toString()}n`;
	}
	if (arg instanceof Error) {
		return JSON.stringify({
			name: arg.name,
			message: arg.message,
			stack: arg.stack,
		});
	}

	if (typeof arg === 'object') {
		const seen = new WeakSet<object>();
		try {
			return JSON.stringify(arg, (_, value) => {
				if (typeof value === 'bigint') return `${value.toString()}n`;
				if (typeof value === 'object' && value !== null) {
					if (seen.has(value)) return '[Circular]';
					seen.add(value);
				}
				return value;
			});
		} catch {
			return '[Unserialisable Object]';
		}
	}

	return String(arg);
}

function forwardConsole(
	fnName: 'log' | 'debug' | 'info' | 'warn' | 'error',
	logger: (message: string) => Promise<void>,
) {
	const original = console[fnName];
	console[fnName] = (...args: unknown[]) => {
		const serialisedArgs = args.map(serialiseConsoleArg);
		original(...args);
		const message = serialisedArgs.join(' ');
		void logger(message);
	};
}

export const initLogger = () => {
	forwardConsole('log', info);
	forwardConsole('debug', debug);
	forwardConsole('info', info);
	forwardConsole('warn', warn);
	forwardConsole('error', error);
};
