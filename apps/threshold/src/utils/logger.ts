import { warn, debug, info, error } from '@tauri-apps/plugin-log';

function forwardConsole(
	fnName: 'log' | 'debug' | 'info' | 'warn' | 'error',
	logger: (message: string) => Promise<void>,
) {
	const original = console[fnName];
	console[fnName] = (...args: any[]) => {
		original(...args);
		const message = args
			.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
			.join(' ');
		logger(message);
	};
}

export const initLogger = () => {
	forwardConsole('log', info);
	forwardConsole('debug', debug);
	forwardConsole('info', info);
	forwardConsole('warn', warn);
	forwardConsole('error', error);
};
