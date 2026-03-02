import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from 'ink-testing-library';
import { VersionBump } from '../src/screens/VersionBump.js';
import { CustomVersion } from '../src/screens/CustomVersion.js';
import { BuildOffer } from '../src/screens/BuildOffer.js';
import { Help } from '../src/screens/Help.js';
import type { CurrentState } from '../src/lib/files.js';

const mockState: CurrentState = {
	tauriVersionName: '0.1.8',
	tauriVersionCode: null,
	tauriDerivedVersionCode: 1008,
	webVersion: '0.1.8',
	wearVersionName: '0.1.8',
	wearVersionCode: 1_000_001_008,
};

describe('VersionBump screen', () => {
	it('renders the current version and bump options', () => {
		const onSelect = vi.fn();
		const { lastFrame } = render(
			<VersionBump
				currentState={mockState}
				onSelect={onSelect}
				onHelp={vi.fn()}
				onReleaseLog={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		const frame = lastFrame()!;
		expect(frame).toContain('0.1.8');
		expect(frame).toContain('Patch');
		expect(frame).toContain('Minor');
		expect(frame).toContain('Major');
		expect(frame).toContain('Custom');
		expect(frame).toContain('Redo');
	});

	it('calls onSelect with patch bump when p is pressed', async () => {
		const onSelect = vi.fn();
		const { stdin } = render(
			<VersionBump
				currentState={mockState}
				onSelect={onSelect}
				onHelp={vi.fn()}
				onReleaseLog={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		stdin.write('p');

		await waitFor(() => {
			expect(onSelect).toHaveBeenCalledWith({ mode: 'bump', version: '0.1.9' });
		});
	});

	it('calls onSelect with minor bump when n is pressed', async () => {
		const onSelect = vi.fn();
		const { stdin } = render(
			<VersionBump
				currentState={mockState}
				onSelect={onSelect}
				onHelp={vi.fn()}
				onReleaseLog={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		stdin.write('n');

		await waitFor(() => {
			expect(onSelect).toHaveBeenCalledWith({ mode: 'bump', version: '0.2.0' });
		});
	});

	it('calls onSelect with major bump when j is pressed', async () => {
		const onSelect = vi.fn();
		const { stdin } = render(
			<VersionBump
				currentState={mockState}
				onSelect={onSelect}
				onHelp={vi.fn()}
				onReleaseLog={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		stdin.write('j');

		await waitFor(() => {
			expect(onSelect).toHaveBeenCalledWith({ mode: 'bump', version: '1.0.0' });
		});
	});

	it('calls onSelect with redo when r is pressed', async () => {
		const onSelect = vi.fn();
		const { stdin } = render(
			<VersionBump
				currentState={mockState}
				onSelect={onSelect}
				onHelp={vi.fn()}
				onReleaseLog={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		stdin.write('r');

		await waitFor(() => {
			expect(onSelect).toHaveBeenCalledWith({ mode: 'redo', version: '0.1.8' });
		});
	});

	it('calls onQuit when q is pressed', async () => {
		const onQuit = vi.fn();
		const { stdin } = render(
			<VersionBump
				currentState={mockState}
				onSelect={vi.fn()}
				onHelp={vi.fn()}
				onReleaseLog={vi.fn()}
				onQuit={onQuit}
			/>,
		);

		stdin.write('q');

		await waitFor(() => {
			expect(onQuit).toHaveBeenCalled();
		});
	});

	it('calls onHelp when ? is pressed', async () => {
		const onHelp = vi.fn();
		const { stdin } = render(
			<VersionBump
				currentState={mockState}
				onSelect={vi.fn()}
				onHelp={onHelp}
				onReleaseLog={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		stdin.write('?');

		await waitFor(() => {
			expect(onHelp).toHaveBeenCalled();
		});
	});

	it('calls onReleaseLog when l is pressed', async () => {
		const onReleaseLog = vi.fn();
		const { stdin } = render(
			<VersionBump
				currentState={mockState}
				onSelect={vi.fn()}
				onHelp={vi.fn()}
				onReleaseLog={onReleaseLog}
				onQuit={vi.fn()}
			/>,
		);

		stdin.write('l');

		await waitFor(() => {
			expect(onReleaseLog).toHaveBeenCalled();
		});
	});
});

describe('CustomVersion screen', () => {
	it('renders the input prompt', () => {
		const { lastFrame } = render(
			<CustomVersion
				currentState={mockState}
				onConfirm={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);

		const frame = lastFrame()!;
		expect(frame).toContain('Enter version');
		expect(frame).toContain('X.Y.Z');
	});
});

describe('BuildOffer screen', () => {
	it('renders version and tag info', () => {
		const { lastFrame } = render(
			<BuildOffer
				version="0.1.9"
				tagName="v0.1.9"
				onBuild={vi.fn()}
				onSkip={vi.fn()}
				onHelp={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		const frame = lastFrame()!;
		expect(frame).toContain('0.1.9');
		expect(frame).toContain('v0.1.9');
		expect(frame).toContain('Build phone + wear');
		expect(frame).toContain('Skip');
	});

	it('calls onBuild when b is pressed', async () => {
		const onBuild = vi.fn();
		const { stdin } = render(
			<BuildOffer
				version="0.1.9"
				tagName="v0.1.9"
				onBuild={onBuild}
				onSkip={vi.fn()}
				onHelp={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		stdin.write('b');

		await waitFor(() => {
			expect(onBuild).toHaveBeenCalled();
		});
	});

	it('calls onSkip when s is pressed', async () => {
		const onSkip = vi.fn();
		const { stdin } = render(
			<BuildOffer
				version="0.1.9"
				tagName="v0.1.9"
				onBuild={vi.fn()}
				onSkip={onSkip}
				onHelp={vi.fn()}
				onQuit={vi.fn()}
			/>,
		);

		stdin.write('s');

		await waitFor(() => {
			expect(onSkip).toHaveBeenCalled();
		});
	});
});

describe('Help screen', () => {
	it('renders all hotkey sections', () => {
		const { lastFrame } = render(<Help onClose={vi.fn()} />);

		const frame = lastFrame()!;
		expect(frame).toContain('Global keys');
		expect(frame).toContain('Version bump');
		expect(frame).toContain('Review');
		expect(frame).toContain('Tag conflict');
		expect(frame).toContain('Build');
	});

	it('calls onClose when any key is pressed', async () => {
		const onClose = vi.fn();
		const { stdin } = render(<Help onClose={onClose} />);

		stdin.write('x');

		await waitFor(() => {
			expect(onClose).toHaveBeenCalled();
		});
	});
});
