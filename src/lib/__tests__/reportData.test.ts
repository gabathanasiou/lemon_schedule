import { describe, it, expect } from 'vitest';
import {
  reportItemKey,
  reportItemLabel,
  applyItemFilter,
  filterItemsByScope,
  flaggedIdsOf,
  todayIso,
} from '../reportData';

describe('reportItemKey', () => {
  it('uses the right identifier per collection', () => {
    expect(reportItemKey('scenes' as any, { scene: { id: 's1' } } as any)).toBe('s1');
    expect(reportItemKey('days' as any, { section: { index: 2 } } as any)).toBe(2);
    expect(reportItemKey('categories' as any, { key: 'props' } as any)).toBe('props');
    expect(reportItemKey('locations' as any, { id: 'loc1' } as any)).toBe('loc1');
    expect(reportItemKey('departmentCallsOfDay' as any, { key: 'camera' } as any)).toBe('camera');
  });
});

describe('reportItemLabel', () => {
  it('labels days with the chrono day', () => {
    expect(reportItemLabel('days' as any, { chronoDay: 3, date: '2026-08-10' } as any)).toContain('Day 3');
  });
  it('labels crew as "role: name"', () => {
    expect(reportItemLabel('crew' as any, { role: 'Director', name: 'Frank' } as any)).toBe('Director: Frank');
  });
  it('labels elements by name', () => {
    expect(reportItemLabel('elements' as any, { name: 'gun' } as any)).toBe('gun');
  });
});

describe('applyItemFilter', () => {
  const items = [{ k: 'a' }, { k: 'b' }, { k: 'c' }] as any;
  const resolve = (it: any) => it.k;

  it('returns all items for a missing or empty filter', () => {
    expect(applyItemFilter(items, undefined, resolve)).toEqual(items);
    expect(applyItemFilter(items, { field: 'k', values: [] } as any, resolve)).toEqual(items);
  });

  it('keeps only items whose resolved value is listed', () => {
    expect(applyItemFilter(items, { field: 'k', values: ['a', 'c'] } as any, resolve)).toEqual([{ k: 'a' }, { k: 'c' }]);
  });
});

describe('filterItemsByScope', () => {
  const scenes = [{ scene: { id: 's1' } }, { scene: { id: 's2' } }, { scene: { id: 's3' } }] as any;
  const crew = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] as any;

  it('includes everything when no matching scope exists', () => {
    expect(filterItemsByScope(scenes, 'scenes' as any, undefined, undefined)).toEqual(scenes);
    expect(filterItemsByScope(scenes, 'scenes' as any, undefined, { scopes: [] } as any)).toEqual(scenes);
  });

  it('filters by item key when the scope matches', () => {
    const filter = { scopes: [{ collection: 'scenes', include: ['s2'] }] } as any;
    expect(filterItemsByScope(scenes, 'scenes' as any, undefined, filter)).toEqual([{ scene: { id: 's2' } }]);
  });

  it('filters crew by resolved index (crew has no stable key)', () => {
    const filter = { scopes: [{ collection: 'crew', include: [0, 2] }] } as any;
    expect(filterItemsByScope(crew, 'crew' as any, undefined, filter)).toEqual([{ id: 'c1' }, { id: 'c3' }]);
  });
});

describe('flaggedIdsOf', () => {
  it('prefers sceneIds and falls back to the singular sceneId', () => {
    expect(flaggedIdsOf({ sceneIds: ['a', 'b'] } as any)).toEqual(['a', 'b']);
    expect(flaggedIdsOf({ sceneId: 'x' } as any)).toEqual(['x']);
    expect(flaggedIdsOf({} as any)).toEqual([]);
  });
});

describe('todayIso', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
