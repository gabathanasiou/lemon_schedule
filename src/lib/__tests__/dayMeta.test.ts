import { describe, it, expect } from 'vitest';
import {
  daybreakAbove,
  sectionCallTime,
  getDayMeta,
  isEmptyDayMeta,
  patchDayMeta,
  setCrewCall,
  pruneDayMetaRefs,
} from '../dayMeta';

const row = (callTime: string, meta?: any) => ({ id: `d-${callTime}`, daybreakCallTime: callTime, daybreakMeta: meta } as any);

describe('daybreakAbove / sectionCallTime', () => {
  const sections = [
    { index: 0, isPinned: true, daybreakRow: row('07:00') },
    { index: 1, daybreakRow: row('08:00') },
    { index: 2 },
  ];

  it('governs a section by the daybreak ABOVE it', () => {
    expect(daybreakAbove(sections, 1)).toBe(sections[0].daybreakRow);
    expect(daybreakAbove(sections, 2)).toBe(sections[1].daybreakRow);
    expect(daybreakAbove(sections, 0)).toBeUndefined();
  });

  it('prefers the above call time, then the section own, then the fallback', () => {
    expect(sectionCallTime(sections, 1)).toBe('07:00');
    // section 2 has no own daybreak → above (section 1's 08:00)
    expect(sectionCallTime(sections, 2)).toBe('08:00');
    expect(sectionCallTime([{ index: 0 }], 0, '09:30')).toBe('09:30');
  });
});

describe('getDayMeta / isEmptyDayMeta', () => {
  it('returns EMPTY for a missing row and the meta otherwise', () => {
    expect(getDayMeta(undefined)).toEqual({});
    expect(getDayMeta(row('08:00'))).toEqual({});
    expect(getDayMeta(row('08:00', { note: 'hi' }))).toEqual({ note: 'hi' });
  });

  it('treats empty/blank meta as empty', () => {
    expect(isEmptyDayMeta(undefined)).toBe(true);
    expect(isEmptyDayMeta({})).toBe(true);
    expect(isEmptyDayMeta({ note: '   ' })).toBe(true);
    expect(isEmptyDayMeta({ crewIds: [] })).toBe(true);
    expect(isEmptyDayMeta({ elementCalls: { cast: {} } })).toBe(true);
    expect(isEmptyDayMeta({ callSheets: {} })).toBe(true);
  });

  it('detects real day data', () => {
    expect(isEmptyDayMeta({ locationId: 'loc1' })).toBe(false);
    expect(isEmptyDayMeta({ note: 'Parking behind the diner' })).toBe(false);
    expect(isEmptyDayMeta({ crewIds: ['p1'] })).toBe(false);
    expect(isEmptyDayMeta({ departmentPrecalls: { Camera: '-30m' } })).toBe(false);
    expect(isEmptyDayMeta({ elementCalls: { cast: { '1': { arrive: '07:00' } } } })).toBe(false);
    expect(isEmptyDayMeta({ callSheets: { design: [{ id: 'b' }] } })).toBe(false);
  });
});

describe('patchDayMeta', () => {
  it('dispatches UPDATE_ROW merging the patch into the existing meta', () => {
    const calls: any[] = [];
    const dispatch = (a: any) => calls.push(a);
    patchDayMeta(dispatch, 'v1', { id: 'r1', daybreakMeta: { note: 'old' } } as any, { locationId: 'loc1' } as any);
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe('UPDATE_ROW');
    expect(calls[0].payload).toMatchObject({ versionId: 'v1', rowId: 'r1' });
    expect(calls[0].payload.updates.daybreakMeta).toEqual({ note: 'old', locationId: 'loc1' });
  });
});

describe('setCrewCall', () => {
  it('adds a new override', () => {
    expect(setCrewCall(undefined, 'p1', '07:30')).toEqual([{ personId: 'p1', callTime: '07:30' }]);
  });
  it('updates an existing override', () => {
    expect(setCrewCall([{ personId: 'p1', callTime: '07:00' }], 'p1', '08:00')).toEqual([{ personId: 'p1', callTime: '08:00' }]);
  });
  it('clearing removes the entry (returns undefined when empty)', () => {
    expect(setCrewCall([{ personId: 'p1', callTime: '07:00' }], 'p1', '')).toBeUndefined();
  });
  it('keeps an entry that still carries a note', () => {
    expect(setCrewCall([{ personId: 'p1', callTime: '07:00', note: 'driver' }], 'p1', '')).toEqual([{ personId: 'p1', note: 'driver' }]);
  });
});

describe('pruneDayMetaRefs', () => {
  it('drops dangling crew and location references', () => {
    const meta: any = { crewIds: ['p1', 'gone'], locationId: 'gone', locationIds: ['loc1', 'gone'], note: 'keep' };
    const pruned = pruneDayMetaRefs(meta, { crewIds: new Set(['p1']), locationIds: new Set(['loc1']) });
    expect(pruned.crewIds).toEqual(['p1']);
    expect(pruned.locationId).toBeUndefined();
    expect(pruned.locationIds).toEqual(['loc1']);
    expect(pruned.note).toBe('keep');
  });

  it('returns the SAME object when nothing dangles', () => {
    const meta: any = { crewIds: ['p1'], locationId: 'loc1' };
    expect(pruneDayMetaRefs(meta, { crewIds: new Set(['p1']), locationIds: new Set(['loc1']) })).toBe(meta);
  });
});
