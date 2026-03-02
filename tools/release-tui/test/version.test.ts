import { describe, it, expect } from 'vitest';
import {
	parseSemver,
	bumpSemver,
	deriveTauriVersionCode,
	deriveWearVersionCode,
	isValidSemver,
} from '../src/lib/version.js';

describe('parseSemver', () => {
	it('parses a stable version', () => {
		expect(parseSemver('0.1.8')).toEqual({
			major: 0,
			minor: 1,
			patch: 8,
			prerelease: '',
		});
	});

	it('parses a prerelease version', () => {
		expect(parseSemver('1.2.3-rc.1')).toEqual({
			major: 1,
			minor: 2,
			patch: 3,
			prerelease: 'rc.1',
		});
	});

	it('returns null for invalid version', () => {
		expect(parseSemver('not-a-version')).toBeNull();
		expect(parseSemver('1.2')).toBeNull();
		expect(parseSemver('')).toBeNull();
	});
});

describe('bumpSemver', () => {
	it('bumps patch', () => {
		expect(bumpSemver('0.1.8', 'patch')).toBe('0.1.9');
	});

	it('bumps minor', () => {
		expect(bumpSemver('0.1.8', 'minor')).toBe('0.2.0');
	});

	it('bumps major', () => {
		expect(bumpSemver('0.1.8', 'major')).toBe('1.0.0');
	});

	it('throws on invalid version', () => {
		expect(() => bumpSemver('bad', 'patch')).toThrow();
	});
});

describe('deriveTauriVersionCode', () => {
	it('derives version code for 0.1.8', () => {
		expect(deriveTauriVersionCode('0.1.8')).toBe(1008);
	});

	it('derives version code for 1.0.0', () => {
		expect(deriveTauriVersionCode('1.0.0')).toBe(1_000_000);
	});

	it('derives version code for 2.3.4', () => {
		expect(deriveTauriVersionCode('2.3.4')).toBe(2_003_004);
	});
});

describe('deriveWearVersionCode', () => {
	it('adds 1 billion offset to tauri version code', () => {
		expect(deriveWearVersionCode('0.1.8')).toBe(1_000_001_008);
	});
});

describe('isValidSemver', () => {
	it('accepts valid versions', () => {
		expect(isValidSemver('0.1.8')).toBe(true);
		expect(isValidSemver('1.0.0-rc.1')).toBe(true);
	});

	it('rejects invalid versions', () => {
		expect(isValidSemver('bad')).toBe(false);
		expect(isValidSemver('1.2')).toBe(false);
	});
});
