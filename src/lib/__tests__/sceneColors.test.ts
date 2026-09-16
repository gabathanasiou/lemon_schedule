import { describe, it, expect } from 'vitest';
import {
  getIntExtOptions,
  getDayNightOptions,
  sceneMatchesRule,
  resolveSceneColor,
  sceneStyle,
  getDefaultSceneColors,
  getFallbackStripColors,
  getSelectedStripColors,
  getDayHeaderColors,
  getDayFooterColors,
  getNoteBannerColors,
} from '../sceneColors';

const scene = (over: any = {}): any => ({ id: 's1', sceneNumber: '1', intExt: 'INT', dayNight: 'DAY', cast: '', set: '', props: '', ...over });

const singleRule = (over: any = {}): any => ({
  id: 'r1', enabled: true,
  conditions: [{ category: 'props', elementId: 'gun' }],
  override: { type: 'single', background: '#111111', text: '#ffffff' },
  ...over,
});

describe('option fallbacks', () => {
  it('uses the built-ins unless the palette overrides them', () => {
    expect(getIntExtOptions()).toContain('INT');
    expect(getDayNightOptions()).toContain('NIGHT');
    expect(getIntExtOptions({ intExtOptions: ['WIDE'] } as any)).toEqual(['WIDE']);
  });
});

describe('sceneMatchesRule', () => {
  it('ANDs every condition; empty search never matches', () => {
    const p = scene({ props: 'gun, rope' });
    expect(sceneMatchesRule(p, singleRule())).toBe(true);
    expect(sceneMatchesRule(p, singleRule({ conditions: [{ category: 'props', elementId: 'knife' }] }))).toBe(false);
    expect(sceneMatchesRule(p, singleRule({ conditions: [{ category: 'props', elementId: '  ' }] }))).toBe(false);
    const two = singleRule({ conditions: [{ category: 'props', elementId: 'gun' }, { category: 'set', elementId: 'stage' }] });
    expect(sceneMatchesRule(scene({ props: 'gun', set: 'Stage' }), two)).toBe(true);
    expect(sceneMatchesRule(scene({ props: 'gun', set: 'Other' }), two)).toBe(false);
  });

  it('compares cast by id and single-value categories exactly (case-insensitive)', () => {
    expect(sceneMatchesRule(scene({ cast: '1, 2' }), singleRule({ conditions: [{ category: 'cast', elementId: '2' }] }))).toBe(true);
    expect(sceneMatchesRule(scene({ set: 'Stage 7' }), singleRule({ conditions: [{ category: 'set', elementId: 'stage 7' }] }))).toBe(true);
    expect(sceneMatchesRule(scene({ set: 'Stage 7' }), singleRule({ conditions: [{ category: 'set', elementId: 'stage' }] }))).toBe(false);
  });
});

describe('resolveSceneColor', () => {
  it('uses the built-in fallbacks', () => {
    expect(resolveSceneColor('INT', 'DAY')).toEqual({ background: '#ffffff', color: '#000000' });
    expect(resolveSceneColor('EXT', 'NIGHT')).toEqual({ background: '#005c93', color: '#ffffff' });
    expect(resolveSceneColor('', '')).toEqual({ background: '#ffffff', color: '#000000' });
  });

  it('prefers explicit color entries over the fallback', () => {
    const entries = [{ intExt: 'INT', dayNight: 'DAY', background: '#123456', text: '#abcdef' }];
    expect(resolveSceneColor('int', 'day', entries as any)).toEqual({ background: '#123456', color: '#abcdef' });
    expect(resolveSceneColor('EXT', 'NIGHT', entries as any)).toEqual({ background: '#005c93', color: '#ffffff' });
  });

  it('rules win over entries; disabled rules are skipped', () => {
    const entries = [{ intExt: 'INT', dayNight: 'DAY', background: '#123456', text: '#abcdef' }];
    const p = scene({ props: 'gun' });
    expect(resolveSceneColor('INT', 'DAY', entries as any, undefined, p, [singleRule()])).toEqual({ background: '#111111', color: '#ffffff' });
    expect(resolveSceneColor('INT', 'DAY', entries as any, undefined, p, [singleRule({ enabled: false })])).toEqual({ background: '#123456', color: '#abcdef' });
  });

  it('per-type rule overrides match the scene type', () => {
    const rule = {
      id: 'r2', enabled: true, conditions: [{ category: 'props', elementId: 'gun' }],
      override: { type: 'sceneColors', sceneColors: [{ intExt: 'EXT', dayNight: 'NIGHT', background: '#000001', text: '#eeeeee' }] },
    };
    const p = scene({ props: 'gun', intExt: 'EXT', dayNight: 'NIGHT' });
    expect(resolveSceneColor('EXT', 'NIGHT', undefined, undefined, p, [rule as any])).toEqual({ background: '#000001', color: '#eeeeee' });
    // no matching type → falls through to the built-in fallback
    expect(resolveSceneColor('INT', 'DAY', undefined, undefined, p, [rule as any])).toEqual({ background: '#ffffff', color: '#000000' });
  });

  it('uses the fallbackOverride when nothing else matches', () => {
    expect(resolveSceneColor('WIDE', 'DAY', undefined, { background: '#aabbcc', color: '#000000' })).toEqual({ background: '#aabbcc', color: '#000000' });
  });
});

describe('sceneStyle', () => {
  it('returns the fallback for a missing scene and resolves otherwise', () => {
    expect(sceneStyle(null)).toEqual({ background: '#ffffff', color: '#000000' });
    expect(sceneStyle(scene({ intExt: 'EXT', dayNight: 'NIGHT' }))).toEqual({ background: '#005c93', color: '#ffffff' });
  });
});

describe('palette-derived colors', () => {
  it('getDefaultSceneColors covers every option pair', () => {
    const entries = getDefaultSceneColors(['INT', 'EXT'], ['DAY', 'NIGHT']);
    expect(entries).toHaveLength(4);
    expect(entries.find(e => e.intExt === 'EXT' && e.dayNight === 'NIGHT')).toMatchObject({ background: '#005c93', text: '#ffffff' });
  });

  it('the chrome color getters fall back when the palette is missing/partial', () => {
    expect(getFallbackStripColors()).toEqual({ background: '#a77b00', color: '#ffffff' });
    expect(getSelectedStripColors()).toEqual({ background: '#b20000', color: '#ffffff' });
    expect(getDayHeaderColors()).toEqual({ background: '#000000', color: '#ffffff' });
    expect(getDayFooterColors()).toEqual({ background: '#ffffff', color: '#000000' });
    expect(getNoteBannerColors()).toEqual({ background: '#3f0000', color: '#ffffff' });
    expect(getDayFooterColors({ dayFooterBg: '#eeeeee' } as any)).toEqual({ background: '#eeeeee', color: '#000000' });
  });
});
