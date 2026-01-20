import { PlatformUtils } from './PlatformUtils';

type TransitionDirection = 'forwards' | 'backwards' | 'none';

export class RouteTransitions {
    private stack: string[] = [];
    private nextDirectionOverride: TransitionDirection | null = null;

    constructor() {
        // Initialize with current path if available
        if (typeof window !== 'undefined') {
            this.stack.push(window.location.pathname);
        }
    }

    /**
     * Checks if View Transitions should be enabled.
     * Only on Android and if the API exists.
     */
    public shouldAnimate(): boolean {
        // PlatformUtils.getPlatform() returns 'android', 'ios', 'windows', 'macos', 'linux'
        const isAndroid = PlatformUtils.getPlatform() === 'android';
        const hasApi = 'startViewTransition' in document;
        return isAndroid && hasApi;
    }

    /**
     * Call this before a navigation to determine the direction.
     * Updates the internal stack.
     */
    public getDirection(toPath: string): TransitionDirection {
        if (!this.shouldAnimate()) {
            return 'none';
        }

        // Check for override (e.g. hardware back button)
        if (this.nextDirectionOverride) {
            const direction = this.nextDirectionOverride;
            this.nextDirectionOverride = null;
            this.updateStack(toPath, direction);
            return direction;
        }

        const currentPath = this.stack[this.stack.length - 1];

        // Same page?
        if (currentPath === toPath) {
            return 'none';
        }

        // Check if going back to previous page in stack
        const previousPath = this.stack[this.stack.length - 2];
        if (previousPath === toPath) {
            this.updateStack(toPath, 'backwards');
            return 'backwards';
        }

        // Default to forwards
        this.updateStack(toPath, 'forwards');
        return 'forwards';
    }

    /**
     * Manually set the next transition direction.
     * Useful for hardware back buttons.
     */
    public setNextDirection(direction: TransitionDirection) {
        this.nextDirectionOverride = direction;
    }

    private updateStack(toPath: string, direction: TransitionDirection) {
        if (direction === 'backwards') {
            this.stack.pop();
        } else if (direction === 'forwards') {
            this.stack.push(toPath);
        }
        // 'none' doesn't change stack
    }
}

export const routeTransitions = new RouteTransitions();
