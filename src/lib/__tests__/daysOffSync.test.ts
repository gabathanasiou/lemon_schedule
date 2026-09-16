import { describe, it, expect } from 'vitest';
import { computeDaysOffSync, monBased } from '../daysOffSync';

// 2026-08-10 is a Monday; 08-15 Sat, 08-16 Sun.
const base = (over: any = {}) => ({
  prepStart: '',
  productionStart: '2026-08-10',
  postEnd: '',
  daysOff: new Set([5, 6]), // Sat, Sun
  current: [] as any[],
  productionDayCount: 10,
  ...over,
});

describe('monBased', () => {
  it('is Mon=0 .. Sun=6', () => {
    expect(monBased('2026-08-10')).toBe(0);
    expect(monBased('2026-08-15')).toBe(5);
    expect(monBased('2026-08-16')).toBe(6);
  });
});

describe('computeDaysOffSync', () => {
  it('reports missing / invalid start dates', () => {
    expect(computeDaysOffSync(base({ productionStart: '' })).kind).toBe('no-start');
    expect(computeDaysOffSync(base({ productionStart: 'nonsense' })).kind).toBe('invalid-start');
  });

  it('marks pattern weekdays as holiday statuses across the span', () => {
    const r = computeDaysOffSync(base());
    expect(r.kind).toBe('applied');
    if (r.kind !== 'applied') return;
    expect(r.added.length).toBeGreaterThan(0);
    expect(r.removed).toBe(0);
    for (const d of r.added) {
      expect(d.status).toBe('holiday');
      expect(d.pattern).toBe(true);
      expect([5, 6]).toContain(monBased(d.date));
    }
  });

  it('is a no-op when re-applied over its own output', () => {
    const first = computeDaysOffSync(base());
    if (first.kind !== 'applied') throw new Error('expected applied');
    expect(computeDaysOffSync(base({ current: first.nonShootDates })).kind).toBe('no-change');
  });

  it('removes pattern statuses on weekdays no longer in the pattern', () => {
    // A pattern holiday on Monday, but the pattern is Sat/Sun only.
    const r = computeDaysOffSync(base({ current: [{ date: '2026-08-10', status: 'holiday', pattern: true }] }));
    if (r.kind !== 'applied') throw new Error('expected applied');
    expect(r.removed).toBe(1);
    expect(r.nonShootDates.some(n => n.date === '2026-08-10' && n.status === 'holiday')).toBe(false);
  });

  it('keeps cards/notes on a removed day, stripping only the status', () => {
    const withContent = [{ date: '2026-08-10', status: 'holiday', pattern: true, lists: { hold: { cast: ['1'] } } }];
    const r = computeDaysOffSync(base({ current: withContent, productionDayCount: 1 }));
    if (r.kind !== 'applied') throw new Error('expected applied');
    expect(r.removed).toBe(1);
    const kept = r.nonShootDates.find(n => n.date === '2026-08-10')!;
    expect(kept.status).toBeUndefined();
    expect(kept.pattern).toBeUndefined();
    expect(kept.lists).toEqual({ hold: { cast: ['1'] } });
  });

  it('leaves hand-made non-pattern statuses alone', () => {
    const handmade = [{ date: '2026-08-10', status: 'hold' }];
    const r = computeDaysOffSync(base({ current: handmade }));
    if (r.kind !== 'applied') throw new Error('expected applied');
    expect(r.nonShootDates.find(n => n.date === '2026-08-10')!.status).toBe('hold');
  });
});
