import { describe, it, expect } from 'vitest';
import {
  projectThemeOf,
  projectAccentOf,
  projectAccentNameOf,
  projectModalThemeOf,
  tabPillFillOf,
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

  it('theme-scope accent: zinc / blue / emerald', () => {
    expect(projectAccentNameOf('local')).toBe('zinc');
    expect(projectAccentNameOf('drive')).toBe('blue');
    expect(projectAccentNameOf('shared')).toBe('emerald');
  });

  it('modal theme: every project kind uses a neutral surface; accent is identity only (roadmap 302)', () => {
    expect(projectModalThemeOf('local')).toEqual({ accent: 'zinc', surface: 'neutral' });
    expect(projectModalThemeOf('drive')).toEqual({ accent: 'blue', surface: 'neutral' });
    expect(projectModalThemeOf('shared')).toEqual({ accent: 'emerald', surface: 'neutral' });
  });

  it('tab pill: zinc keeps the plain pill; dark accent chrome uses the raised accent role', () => {
    expect(tabPillFillOf('zinc', 'dark')).toBe('bg-[var(--ui-tab-pill-plain)]');
    expect(tabPillFillOf('zinc', 'light')).toBe('bg-[var(--ui-tab-pill-plain)]');
    expect(tabPillFillOf('blue', 'dark')).toBe('bg-[var(--ui-accent-pill-bg)]');
    expect(tabPillFillOf('emerald', 'dark')).toBe('bg-[var(--ui-accent-pill-bg)]');
    expect(tabPillFillOf('blue', 'light')).toBe('bg-[var(--ui-tab-pill-accent)]');
    expect(tabPillFillOf('emerald', 'light')).toBe('bg-[var(--ui-tab-pill-accent)]');
  });

  it('barHex: the bar fill as hex for the status-bar tint (roadmap 265)', () => {
    expect(PROJECT_CHROME.local.barHex).toBe('#09090b');
    expect(PROJECT_CHROME.drive.barHex).toBe('#172554');
    expect(PROJECT_CHROME.shared.barHex).toBe('#022c22');
  });

});
