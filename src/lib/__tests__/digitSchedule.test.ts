import { describe, it, expect } from 'vitest';
import { targetDaybreaks, scheduleRowsToDay } from '../digitSchedule';

const row = (id: string, type: string, order: number, extra: any = {}) => ({ id, type, order, containerId: null, ...extra }) as any;

const pinned = row('pinned', 'DAYBREAK', 0, { pinned: true, containerId: 1 });
const sceneX = row('x', 'SCENE', 1, { containerId: 1 });
const d1 = row('d1', 'DAYBREAK', 2, { containerId: 1 });
const sceneY = row('y', 'SCENE', 3, { containerId: 1 });
const d2 = row('d2', 'DAYBREAK', 4, { containerId: 1 });
const a = row('a', 'SCENE', 0);
const b = row('b', 'SCENE', 1);

const rows = [pinned, sceneX, d1, sceneY, d2, a, b];
const daybreaks = targetDaybreaks(rows);

function indexOf(list: any[], id: string) {
  return list.findIndex(r => r.id === id);
}

describe('targetDaybreaks', () => {
  it('returns the non-pinned daybreaks in order (pinned anchor excluded)', () => {
    expect(daybreaks.map(d => d.id)).toEqual(['d1', 'd2']);
  });
});

describe('scheduleRowsToDay', () => {
  it('moves rows into the target day, just before its closing daybreak, in order', () => {
    const next = scheduleRowsToDay(rows, ['a', 'b'], daybreaks, 2)!;
    expect(next.find(r => r.id === 'a')!.containerId).toBe(1);
    expect(next.find(r => r.id === 'b')!.containerId).toBe(1);
    expect(indexOf(next, 'd1')).toBeLessThan(indexOf(next, 'a'));
    expect(indexOf(next, 'a')).toBeLessThan(indexOf(next, 'b'));
    expect(indexOf(next, 'b')).toBeLessThan(indexOf(next, 'd2'));
  });

  it('schedules to Day 1 (before the first daybreak, after the pinned anchor)', () => {
    const next = scheduleRowsToDay(rows, ['a', 'b'], daybreaks, 1)!;
    expect(indexOf(next, 'pinned')).toBeLessThan(indexOf(next, 'a'));
    expect(indexOf(next, 'a')).toBeLessThan(indexOf(next, 'b'));
    expect(indexOf(next, 'b')).toBeLessThan(indexOf(next, 'd1'));
  });

  it('leaves unselected rows untouched', () => {
    const next = scheduleRowsToDay(rows, ['a'], daybreaks, 1)!;
    expect(next.find(r => r.id === 'b')!.containerId).toBeNull();
    expect(next.find(r => r.id === 'x')!.containerId).toBe(1);
  });

  it('returns null for an out-of-range or non-integer day number', () => {
    expect(scheduleRowsToDay(rows, ['a'], daybreaks, 0)).toBeNull();
    expect(scheduleRowsToDay(rows, ['a'], daybreaks, 3)).toBeNull();
    expect(scheduleRowsToDay(rows, ['a'], daybreaks, 1.5)).toBeNull();
  });
});
