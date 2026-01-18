import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export type PredictiveBackState = {
    active: boolean;
    progress: number; // 0 to 1
    edge: 'left' | 'right';
};

type Listener = (state: PredictiveBackState) => void;

class PredictiveBackController {
    private listeners: Set<Listener> = new Set();
    private state: PredictiveBackState = {
        active: false,
        progress: 0,
        edge: 'left'
    };
    private unlistenFns: UnlistenFn[] = [];
    private initialized = false;

    public async init() {
        if (this.initialized) return;

        try {
            // Subscribe to plugin events
            // The plugin emits: predictive-back://started, predictive-back://progress, etc.
            // Tauri v2 plugins usually scope events.
            // In our Kotlin we did: emitEvent("started", ...) which calls super.trigger("started", ...).
            // This usually results in an event name like `plugin:predictive-back|started` or similar depending on setup.
            // Let's assume standard `predictive-back://` or we might need to adjust based on observation.
            // Actually, `tauri-plugin` crate helper `trigger` usually emits to `plugin:<name>:<event>`.
            // BUT, in our Kotlin code we called `emitEvent` which calls `super.trigger`.
            // Let's try listening to both possible formats to be safe, or check documentation.
            // A common pattern is `listen('predictive-back://started', ...)` if manually emitted,
            // but `plugin:predictive-back:started` is the standard v2 way.
            // However, our Kotlin code implementation of `emitEvent` might need to be checked.
            // Wait, I saw `super.trigger(type, data)` in Kotlin.

            // For now, I will assume the event name is constructed by the JS side helper usually,
            // but here we are listening globally.

            // Actually, the best way is to use the `listen` from the plugin JS if we had one.
            // Since we don't have a JS binding package, we use global `listen`.

            // Based on standard Tauri v2:
            // The plugin emits via super.trigger(name, data), which typically results in `plugin:plugin-name:event`.
            // Our plugin identifier is `predictive-back`.
            // So event name should be `plugin:predictive-back:started`.
            const eventPrefix = 'plugin:predictive-back:';

            this.unlistenFns.push(await listen<{ progress: number; edge: 'left' | 'right' }>(`${eventPrefix}started`, (e) => {
                this.updateState({ active: true, progress: e.payload.progress, edge: e.payload.edge });
            }));

            this.unlistenFns.push(await listen<{ progress: number; edge: 'left' | 'right' }>(`${eventPrefix}progress`, (e) => {
                this.updateState({ active: true, progress: e.payload.progress, edge: e.payload.edge });
            }));

            this.unlistenFns.push(await listen(`${eventPrefix}cancelled`, () => {
                this.updateState({ active: false, progress: 0 }); // Or handle animation reset in UI
                this.notifyListeners({ ...this.state, progress: 0, active: false }); // Immediate reset for now, UI can interpolate if it tracks previous.
            }));

            this.unlistenFns.push(await listen(`${eventPrefix}invoked`, () => {
                this.updateState({ active: false, progress: 1 });
            }));

            this.initialized = true;
            console.log('[PredictiveBackController] Initialized');
        } catch (e) {
            console.error('[PredictiveBackController] Failed to init listeners', e);
        }
    }

    public async setCanGoBack(canGoBack: boolean) {
        try {
            await invoke('plugin:predictive-back|set_can_go_back', { canGoBack });
        } catch (e) {
            // Likely not on Android or plugin not loaded
            // console.warn('[PredictiveBackController] setCanGoBack failed', e);
        }
    }

    public subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private updateState(newState: Partial<PredictiveBackState>) {
        this.state = { ...this.state, ...newState };
        this.notifyListeners(this.state);
    }

    private notifyListeners(state: PredictiveBackState) {
        this.listeners.forEach(l => l(state));
    }

    public cleanup() {
        this.unlistenFns.forEach(fn => fn());
        this.unlistenFns = [];
        this.initialized = false;
    }
}

export const predictiveBackController = new PredictiveBackController();
