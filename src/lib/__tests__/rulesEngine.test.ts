import { describe, it, expect } from 'vitest';
import { checkSection, rulesRelevantToDay } from '../rulesEngine';

const CAST = [{ id: '1', name: 'GEORGE' }, { id: '2', name: 'MARY' }] as any;

const scene = (id: string, cast: string): any => ({ id, cast, sceneNumber: id, set: '', intExt: 'INT', dayNight: 'DAY' });
const row = (id: string, sceneId: string, order: number, estimatedDuration = 0): any =>
  ({ id, type: 'SCENE', sceneId, order, estimatedDuration, containerId: 1 });

function section(rule: any, rows: any[], scenes: any[], date = '2026-08-10', base = '08:00') {
  return checkSection(rows, date, base, [rule], scenes, CAST);
}

describe('checkSection — MAX_HOURS', () => {
  const scenes = [scene('s1', '1'), scene('s2', '1'), scene('s3', '2')];

  it('flags the scenes past the cast member\'s max hours', () => {
    const rows = [row('r1', 's1', 0, 90), row('r2', 's2', 1, 90), row('r3', 's3', 2, 0)];
    const v = section({ id: 'r', type: 'MAX_HOURS', castId: '1', maxHours: 2 }, rows, scenes);
    expect(v).toHaveLength(1);
    expect(v[0].ruleType).toBe('MAX_HOURS');
    expect(v[0].sceneIds).toEqual(['s2']);
  });

  it('respects a date-scoped window', () => {
    const rows = [row('r1', 's1', 0, 200)];
    const rule = { id: 'r', type: 'MAX_HOURS', castId: '1', maxHours: 2, dates: ['2026-08-11'] };
    expect(section(rule, rows, scenes, '2026-08-10')).toEqual([]);
    expect(section(rule, rows, scenes, '2026-08-11')).toHaveLength(1);
  });
});

describe('checkSection — DATE_RESTRICTION', () => {
  const scenes = [scene('s1', '1')];

  it('flags when the restricted cast works on a restricted date', () => {
    const rule = { id: 'r', type: 'DATE_RESTRICTION', castId: '1', dates: ['2026-08-10'] };
    expect(section(rule, [row('r1', 's1', 0)], scenes)).toHaveLength(1);
    expect(section(rule, [row('r1', 's1', 0)], scenes, '2026-08-09')).toEqual([]);
  });
});

describe('checkSection — TIME_WINDOW', () => {
  const scenes = [scene('s1', '1'), scene('s2', '1')];

  it('flags scenes whose call/end fall outside the window', () => {
    const rows = [row('r1', 's1', 0, 30), row('r2', 's2', 1, 60)];
    const rule = { id: 'r', type: 'TIME_WINDOW', castId: '1', windowStart: '08:00', windowEnd: '09:00', dates: [] };
    const v = section(rule, rows, scenes, '2026-08-10', '08:00');
    expect(v).toHaveLength(1);
    expect(v[0].sceneIds).toEqual(['s2']);
  });
});

describe('checkSection — CAST_CONFLICT / CAST_SCENE_FLAG', () => {
  const scenes = [scene('s1', '1'), scene('s2', '2')];

  it('flags a conflict only when both groups are present', () => {
    const rule = { id: 'r', type: 'CAST_CONFLICT', castIds: ['1'], conflictCastIds: ['2'], dates: [] };
    const both = section(rule, [row('r1', 's1', 0), row('r2', 's2', 1)], scenes);
    expect(both).toHaveLength(1);
    expect(both[0].sceneIds).toEqual(['s1', 's2']);
    const onlyA = section(rule, [row('r1', 's1', 0)], scenes);
    expect(onlyA).toEqual([]);
  });

  it('flags every scene containing a watched cast member', () => {
    const rule = { id: 'r', type: 'CAST_SCENE_FLAG', castIds: ['2'], dates: [] };
    const v = section(rule, [row('r1', 's1', 0), row('r2', 's2', 1)], scenes);
    expect(v).toHaveLength(1);
    expect(v[0].sceneIds).toEqual(['s2']);
  });
});

describe('rulesRelevantToDay', () => {
  it('keeps every-day rules and matching date-scoped rules; CAST_* always apply', () => {
    const rules = [
      { id: 'a', type: 'MAX_HOURS', dates: [] },
      { id: 'b', type: 'DATE_RESTRICTION', dates: ['2026-08-10'] },
      { id: 'c', type: 'TIME_WINDOW', dates: ['2026-08-11'] },
      { id: 'd', type: 'CAST_CONFLICT', dates: ['2026-08-11'] },
    ] as any;
    expect(rulesRelevantToDay(rules, '2026-08-10').map((r: any) => r.id)).toEqual(['a', 'b', 'd']);
  });
});
