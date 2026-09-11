import { describe, it, expect } from 'vitest';
import {
  addDays,
  buildNonShootSet,
  advanceDateCursor,
  formatElapsedCaption,
  renumberRows,
  insertionOrder,
} from '../daybreakUtils';
import type { NonShootDate, ScheduleRow } from '../../types';

describe('addDays', () => {
  it('adds/subtracts calendar days', () => {
    expect(addDays('2026-08-30', 1)).toBe('2026-08-31');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('buildNonShootSet', () => {
  it('keeps only dated entries that carry a status', () => {
    const dates: NonShootDate[] = [
      { date: '2026-08-10', status: 'hold' },
      { date: '2026-08-11' },
      { date: '2026-08-12', status: '' },
      { date: '2026-08-13', status: 'holiday' },
    ];
    expect(buildNonShootSet(dates)).toEqual(new Set(['2026-08-10', '2026-08-13']));
  });
  it('handles null', () => {
    expect(buildNonShootSet(null)).toEqual(new Set());
  });
});

describe('advanceDateCursor', () => {
  it('advances past skipped dates', () => {
    const skip = (d: string) => d === '2026-08-17' || d === '2026-08-18';
    expect(advanceDateCursor('2026-08-16', skip)).toBe('2026-08-16');
    expect(advanceDateCursor('2026-08-17', skip)).toBe('2026-08-19');
  });
});

describe('formatElapsedCaption', () => {
  it('describes elapsed from start or from the previous break', () => {
    expect(formatElapsedCaption({ computedDayElapsed: 90 })).toBe('1h 30m after start');
    expect(formatElapsedCaption({ computedDayElapsed: 90, previousBreakEndElapsed: 30 })).toBe('+1h after previous break');
  });
  it('is null without elapsed', () => {
    expect(formatElapsedCaption({})).toBeNull();
  });
});

describe('renumberRows', () => {
  it('densifies orders while preserving identity of already-dense rows', () => {
    const rows = [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 3 },
    ] as ScheduleRow[];
    const out = renumberRows(rows);
    expect(out.map(r => r.order)).toEqual([0, 1, 2]);
    expect(out[0]).toBe(rows[0]);
    expect(out[1]).toBe(rows[1]);
    expect(out[2]).not.toBe(rows[2]);
  });
  it('returns the SAME array when already dense', () => {
    const rows = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }] as ScheduleRow[];
    expect(renumberRows(rows)).toBe(rows);
  });
});

describe('insertionOrder', () => {
  const day = [{ order: 1 }, { order: 2 }] as ScheduleRow[];
  it('midpoints between neighbours', () => {
    expect(insertionOrder(day, 1)).toBe(1.5);
  });
  it('offsets at the ends', () => {
    expect(insertionOrder(day, 0)).toBe(0.5);
    expect(insertionOrder(day, 2)).toBe(2.5);
  });
  it('defaults for an empty day', () => {
    expect(insertionOrder([], 0)).toBe(0.5);
  });
});
