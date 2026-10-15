import { describe, it, expect } from 'vitest';
import {
  projectThemeOf,
  projectAccentOf,
  projectMenuThemeOf,
  projectSegThemeOf,
  PROJECT_CHROME,
} from '../projectTheme';

describe('projectThemeOf', () => {
  it('maps online → shared, drive → drive, else local', () => {
    expect(projectThemeOf({ onlineId: 'p1', driveFileId: 'f1' })).toBe('shared');
    expect(projectThemeOf({ onlineId: 'p1' })).toBe('shared');
    expect(projectThemeOf({ driveFileId: 'f1' })).toBe('drive');
    expect(projectThemeOf({})).toBe('local');
    expect(projectThemeOf(undefined)).toBe('local');
    expect(projectThemeOf(null)).toBe('local');
  });
});

describe('chrome mappers', () => {
  it('button accent: only shared gets emerald', () => {
    expect(projectAccentOf('local')).toBe(false);
    expect(projectAccentOf('drive')).toBe(true);
    expect(projectAccentOf('shared')).toBe('emerald');
  });

  it('menu theme: dark / blue / emerald', () => {
    expect(projectMenuThemeOf('local')).toBe('dark');
    expect(projectMenuThemeOf('drive')).toBe('blue');
    expect(projectMenuThemeOf('shared')).toBe('emerald');
  });

  it('seg theme: light / blue / emerald', () => {
    expect(projectSegThemeOf('local')).toBe('light');
    expect(projectSegThemeOf('drive')).toBe('blue');
    expect(projectSegThemeOf('shared')).toBe('emerald');
  });

  it('barHex: the bar fill as hex for the status-bar tint (roadmap 265)', () => {
    expect(PROJECT_CHROME.local.barHex).toBe('#09090b');
    expect(PROJECT_CHROME.drive.barHex).toBe('#172554');
    expect(PROJECT_CHROME.shared.barHex).toBe('#022c22');
  });

  it('shared never inherits a blue class token', () => {
    for (const token of Object.values(PROJECT_CHROME.shared)) {
      expect(token).not.toMatch(/blue/);
    }
    for (const token of Object.values(PROJECT_CHROME.drive)) {
      expect(token).not.toMatch(/emerald/);
    }
  });
});
