import { describe, it, expect } from 'vitest';
import { buildCastIdMap, firstFreeCastId } from '../import/castIds';
import type { CastMember } from '../../types';

const member = (id: string, name: string): CastMember => ({ id, name });
const chars = (...names: string[]) => names.map(name => ({ name, scenes: [0] }));

describe('buildCastIdMap', () => {
  it('reuses an existing member id when the name matches (no duplicates)', () => {
    const map = buildCastIdMap(chars('AMY', 'BOB'), [member('3', 'AMY')]);
    expect(map.get('AMY')).toBe('3');
    expect(map.get('BOB')).toBe('1'); // next free
  });

  it('matches names case-insensitively', () => {
    const map = buildCastIdMap(chars('amy'), [member('2', 'AMY')]);
    expect(map.get('amy')).toBe('2');
  });

  it('assigns fresh sequential ids skipping ones already in use', () => {
    const map = buildCastIdMap(chars('X', 'Y'), [member('1', 'A'), member('2', 'B')]);
    expect(map.get('X')).toBe('3');
    expect(map.get('Y')).toBe('4');
  });

  it('firstFreeCastId returns the first unused number', () => {
    expect(firstFreeCastId([member('1', 'A'), member('2', 'B')])).toBe(3);
    expect(firstFreeCastId([member('1', 'A'), member('3', 'B')])).toBe(2);
  });
});
