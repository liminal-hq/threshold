import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initLogger } from './utils/logger';

initLogger();
console.log('🚀 [threshold] JS bundle loaded and executing!');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
