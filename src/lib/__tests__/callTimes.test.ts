import { describe, it, expect } from 'vitest';
import {
  parseTimeExpression,
  isValidTimeExpression,
  resolveCallExpression,
  resolveCrewCall,
  computeElementCallChain,
  DEFAULT_CALL_STAGES,
  DEFAULT_CATEGORY_STAGES,
  getCallTimeSettings,
  setElementCall,
} from '../callTimes';
import type { Project } from '../../types';

describe('parseTimeExpression', () => {
  it('parses absolute times', () => {
    expect(parseTimeExpression('7:30')).toEqual({ kind: 'absolute', time: '07:30' });
    expect(parseTimeExpression('730')).toEqual({ kind: 'absolute', time: '07:30' });
  });
  it('parses relative offsets with sign', () => {
    expect(parseTimeExpression('-1h')).toEqual({ kind: 'relative', minutes: -60 });
    expect(parseTimeExpression('+30m')).toEqual({ kind: 'relative', minutes: 30 });
  });
  it('is empty for blank / invalid / zero offsets', () => {
    for (const bad of ['', '   ', 'abc', '-0m', '+0m']) {
      expect(parseTimeExpression(bad)).toEqual({ kind: 'empty' });
    }
  });
  it('isValidTimeExpression mirrors emptiness', () => {
    expect(isValidTimeExpression('7:30')).toBe(true);
    expect(isValidTimeExpression('-45m')).toBe(true);
    expect(isValidTimeExpression('nope')).toBe(false);
    expect(isValidTimeExpression('')).toBe(false);
  });
});

describe('resolveCallExpression', () => {
  it('returns absolute times as-is', () => {
    expect(resolveCallExpression('7:30', '08:00')).toBe('07:30');
  });
  it('resolves relatives against the anchor', () => {
    expect(resolveCallExpression('-1h', '08:00')).toBe('07:00');
    expect(resolveCallExpression('+30m', '08:00')).toBe('08:30');
  });
  it('returns empty for missing/invalid', () => {
    expect(resolveCallExpression('', '08:00')).toBe('');
    expect(resolveCallExpression(undefined, '08:00')).toBe('');
    expect(resolveCallExpression('abc', '08:00')).toBe('');
  });
});

describe('resolveCrewCall', () => {
  it('override wins over precall and day call', () => {
    expect(resolveCrewCall('-30m', '-15m', '08:00')).toBe('07:30');
  });
  it('falls back to the department precall', () => {
    expect(resolveCrewCall(null, '-15m', '08:00')).toBe('07:45');
    expect(resolveCrewCall('', '-15m', '08:00')).toBe('07:45');
  });
  it('falls back to the day call', () => {
    expect(resolveCrewCall(null, null, '08:00')).toBe('08:00');
    expect(resolveCrewCall('garbage', 'garbage', '08:00')).toBe('08:00');
  });
});

describe('computeElementCallChain', () => {
  const keys = DEFAULT_CATEGORY_STAGES.cast; // pickup, arrive, hmua, costume, onSet

  it('walks backwards from the On Set anchor using each stage lead', () => {
    const out = computeElementCallChain(DEFAULT_CALL_STAGES, keys, '08:00');
    expect(out.onSet).toEqual({ time: '08:00', source: 'computed' });
    expect(out.costume.time).toBe('07:30');
    expect(out.hmua.time).toBe('06:30');
    expect(out.arrive.time).toBe('06:00');
    expect(out.pickup.time).toBe('05:00');
  });

  it('an absolute override pins that stage and re-bases earlier stages', () => {
    const out = computeElementCallChain(DEFAULT_CALL_STAGES, keys, '08:00', { hmua: '06:45' });
    expect(out.hmua).toEqual({ time: '06:45', source: 'override', expr: '06:45' });
    expect(out.arrive.time).toBe('06:15');
    expect(out.pickup.time).toBe('05:15');
    // stages after the override (toward the anchor) are unaffected
    expect(out.costume.time).toBe('07:30');
  });

  it('returns {} when the category has no configured stages', () => {
    expect(computeElementCallChain(DEFAULT_CALL_STAGES, [], '08:00')).toEqual({});
  });
});

describe('getCallTimeSettings', () => {
  it('falls back to the built-in stages/category map', () => {
    const s = getCallTimeSettings({} as Project);
    expect(s.stages).toEqual(DEFAULT_CALL_STAGES);
    expect(s.categoryStages.cast).toEqual(DEFAULT_CATEGORY_STAGES.cast);
  });
});

describe('setElementCall', () => {
  it('sets, then clears back to undefined', () => {
    const set = setElementCall(undefined, 'cast', '1', 'hmua', '06:45');
    expect(set).toEqual({ cast: { '1': { hmua: '06:45' } } });
    const cleared = setElementCall(set, 'cast', '1', 'hmua', '');
    expect(cleared).toBeUndefined();
  });
  it('keeps other stages when clearing one', () => {
    const set = setElementCall(undefined, 'cast', '1', 'hmua', '06:45');
    const withArrive = setElementCall(set, 'cast', '1', 'arrive', '06:15');
    const cleared = setElementCall(withArrive, 'cast', '1', 'hmua', '');
    expect(cleared).toEqual({ cast: { '1': { arrive: '06:15' } } });
  });
});
