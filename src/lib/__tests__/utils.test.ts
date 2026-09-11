import { describe, it, expect } from 'vitest';
import {
  addMinutesToTime,
  normalizeTime,
  parseDuration,
  formatDuration,
  parsePageCount,
  formatPageCount,
  naturalSortSceneStrings,
} from '../utils';

describe('addMinutesToTime', () => {
  it('adds minutes within a day', () => {
    expect(addMinutesToTime('08:00', 30)).toBe('08:30');
  });
  it('wraps past midnight', () => {
    expect(addMinutesToTime('23:30', 45)).toBe('00:15');
  });
  it('borrows correctly for negative offsets (the "04:-15" regression)', () => {
    expect(addMinutesToTime('00:15', -30)).toBe('23:45');
    expect(addMinutesToTime('07:30', -45)).toBe('06:45');
  });
  it('wraps whole days', () => {
    expect(addMinutesToTime('12:00', 1440)).toBe('12:00');
    expect(addMinutesToTime('12:00', -1440)).toBe('12:00');
  });
});

describe('normalizeTime', () => {
  it.each([
    ['7:30', '07:30'],
    ['7.30', '07:30'],
    ['730', '07:30'],
    ['0730', '07:30'],
    ['7', '07:00'],
    ['7:30am', '07:30'],
    ['7:30 pm', '19:30'],
    ['7a', '07:00'],
    ['7p', '19:00'],
    ['12a', '00:00'],
    ['12p', '12:00'],
    ['00:00', '00:00'],
  ])('%s -> %s', (raw, out) => {
    expect(normalizeTime(raw)).toBe(out);
  });

  it('rejects relative, blank and out-of-range inputs', () => {
    for (const bad of ['', '   ', '-1h', '+30m', '24:00', '25', '13pm', '0am', '7:99', 'abc']) {
      expect(normalizeTime(bad)).toBeNull();
    }
  });
});

describe('parseDuration / formatDuration', () => {
  it.each([
    ['1h 30m', 90],
    ['45m', 45],
    ['1h', 60],
    ['0d', 0],
    ['1h25', 85],
    ['45', 45],
    ['', 0],
  ])('parseDuration(%s) -> %i', (raw, out) => {
    expect(parseDuration(raw)).toBe(out);
  });

  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h'],
    [90, '1h 30m'],
  ])('formatDuration(%i) -> %s', (n, out) => {
    expect(formatDuration(n)).toBe(out);
  });
});

describe('page-count eighths round-trip', () => {
  it.each([
    ['1 3/8', 1.375],
    ['2/8', 0.25],
    ['1', 1],
    ['1.5', 1.5],
    ['', 0],
  ])('parsePageCount(%s) -> %s', (raw, out) => {
    expect(parsePageCount(raw)).toBe(out);
  });

  it.each([
    [0, '0'],
    [1, '1'],
    [1.375, '1 3/8'],
    [0.25, '2/8'],
    [2, '2'],
  ])('formatPageCount(%s) -> %s', (n, out) => {
    expect(formatPageCount(n)).toBe(out);
  });
});

describe('naturalSortSceneStrings', () => {
  it('sorts numerically, not lexically', () => {
    expect(['10', '2', '1'].sort(naturalSortSceneStrings)).toEqual(['1', '2', '10']);
  });
});
