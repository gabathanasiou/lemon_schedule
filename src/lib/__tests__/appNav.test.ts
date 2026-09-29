import { describe, it, expect } from 'vitest';
import {
  AppPlace,
  initStack,
  pushPlace,
  currentPlace,
  previousPlace,
  samePlace,
  placeToHash,
  parsePlaceHash,
  placeLabel,
  isNavStack,
} from '../appNav';

describe('place hash round-trip', () => {
  it('encodes tab + sub and ignores one-shot targets', () => {
    expect(placeToHash({ tab: 'production', sub: 'days', daySection: 12 })).toBe('production/days');
    expect(placeToHash({ tab: 'schedule', sceneId: 'abc' })).toBe('schedule');
    expect(placeToHash({ tab: 'breakdown', sub: 'nonsense' })).toBe('breakdown');
  });

  it('encodes sub-sub modes as a third segment', () => {
    expect(placeToHash({ tab: 'production', sub: 'days', mode: 'callsheet' })).toBe('production/days/callsheet');
    expect(placeToHash({ tab: 'production', sub: 'days', mode: 'manager' })).toBe('production/days');
    expect(placeToHash({ tab: 'production', sub: 'crew', mode: 'glide' })).toBe('production/crew/glide');
    expect(placeToHash({ tab: 'production', sub: 'locations', mode: 'glide' })).toBe('production/locations/glide');
    expect(placeToHash({ tab: 'production', sub: 'crew', mode: 'nope' })).toBe('production/crew');
  });

  it('parses valid hashes and drops unknown tabs/subs/modes', () => {
    expect(parsePlaceHash('#/production/days')).toEqual({ tab: 'production', sub: 'days' });
    expect(parsePlaceHash('#/production/days/callsheet')).toEqual({ tab: 'production', sub: 'days', mode: 'callsheet' });
    expect(parsePlaceHash('#/production/days/manager')).toEqual({ tab: 'production', sub: 'days', mode: 'manager' });
    expect(parsePlaceHash('#/production/days/nope')).toEqual({ tab: 'production', sub: 'days' });
    expect(parsePlaceHash('#/production/crew/glide')).toEqual({ tab: 'production', sub: 'crew', mode: 'glide' });
    expect(parsePlaceHash('#/production/crew/callsheet')).toEqual({ tab: 'production', sub: 'crew' });
    expect(parsePlaceHash('#/production/crewGlide')).toEqual({ tab: 'production' });
    expect(parsePlaceHash('breakdown/sheet')).toEqual({ tab: 'breakdown', sub: 'sheet' });
    expect(parsePlaceHash('#/schedule')).toEqual({ tab: 'schedule' });
    expect(parsePlaceHash('#/production/nope')).toEqual({ tab: 'production' });
    expect(parsePlaceHash('#/not-a-tab')).toBeNull();
    expect(parsePlaceHash('')).toBeNull();
  });
});

describe('placeLabel', () => {
  it('prefers the sub-sub mode label, then the sub-tab, then the tab', () => {
    expect(placeLabel({ tab: 'production', sub: 'days' })).toBe('Day Manager');
    expect(placeLabel({ tab: 'production', sub: 'days', mode: 'callsheet' })).toBe('Call Sheet');
    expect(placeLabel({ tab: 'production', sub: 'crew', mode: 'glide' })).toBe('Crew Glide');
    expect(placeLabel({ tab: 'production', sub: 'locations' })).toBe('Locations');
    expect(placeLabel({ tab: 'production' })).toBe('Production');
    expect(placeLabel({ tab: 'schedule', sceneId: 'x' })).toBe('Schedule');
  });
});

describe('nav stack', () => {
  const a: AppPlace = { tab: 'breakdown', sub: 'glide' };
  const b: AppPlace = { tab: 'schedule' };
  const c: AppPlace = { tab: 'production', sub: 'crew' };

  it('initializes at the given place with no back entry', () => {
    const nav = initStack(a);
    expect(currentPlace(nav)).toEqual(a);
    expect(previousPlace(nav)).toBeNull();
  });

  it('pushes and reports the previous place', () => {
    const nav = pushPlace(pushPlace(initStack(a), b), c);
    expect(nav.index).toBe(2);
    expect(previousPlace(nav)).toEqual(b);
  });

  it('truncates forward history when pushing after a back', () => {
    const nav = pushPlace(pushPlace(initStack(a), b), { tab: 'calendar' });
    const back = { stack: nav.stack, index: 0 };
    const next = pushPlace(back, c);
    expect(next.stack).toHaveLength(2);
    expect(currentPlace(next)).toEqual(c);
    expect(next.stack[1]).toEqual(c);
  });

  it('replaces the current entry for the same place instead of duplicating', () => {
    const nav = pushPlace(initStack(a), { tab: 'breakdown', sub: 'glide', sheetIndex: 4 });
    expect(nav.stack).toHaveLength(1);
    expect(currentPlace(nav).sheetIndex).toBe(4);
    expect(nav.index).toBe(0);
  });

  it('samePlace ignores targets, compares tab + sub + the sub-sub mode', () => {
    expect(samePlace(a, { tab: 'breakdown', sub: 'glide', sceneId: 'z' })).toBe(true);
    expect(samePlace(a, { tab: 'breakdown', sub: 'sheet' })).toBe(false);
    expect(samePlace({ tab: 'schedule' }, { tab: 'schedule', sub: 'x' })).toBe(false);
    const manager: AppPlace = { tab: 'production', sub: 'days' };
    expect(samePlace(manager, { tab: 'production', sub: 'days', mode: 'manager' })).toBe(true);
    expect(samePlace(manager, { tab: 'production', sub: 'days', mode: 'callsheet' })).toBe(false);
    expect(samePlace({ tab: 'production', sub: 'crew', mode: 'glide' }, { tab: 'production', sub: 'crew' })).toBe(false);
  });

  it('validates persisted stacks from history.state', () => {
    expect(isNavStack({ stack: [a, b], index: 1 })).toBe(true);
    expect(isNavStack({ stack: [a], index: 1 })).toBe(false);
    expect(isNavStack({ stack: [], index: 0 })).toBe(false);
    expect(isNavStack({ stack: [{ tab: 'nope' }], index: 0 })).toBe(false);
    expect(isNavStack({ stack: [{ tab: 'production', sub: 'days', mode: 7 }], index: 0 })).toBe(false);
    expect(isNavStack(null)).toBe(false);
  });
});
