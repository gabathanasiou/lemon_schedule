import { describe, it, expect } from 'vitest';
import { isIdKeyed, getCategoryElements, elementMatchId, elementKey, countOccurrences } from '../elements';

const project = {
  castMembers: [{ id: '1', name: 'GEORGE' }, { id: '2', name: 'MARY' }],
  breakdownElements: { props: [{ id: 'gun', name: 'gun' }, { id: 'rope', name: 'rope' }] },
};

describe('isIdKeyed / getCategoryElements', () => {
  it('reads cast from castMembers and every other category from breakdownElements', () => {
    expect(isIdKeyed('cast')).toBe(true);
    expect(getCategoryElements(project, 'cast').map(e => e.id)).toEqual(['1', '2']);
    expect(getCategoryElements(project, 'props').map(e => e.name)).toEqual(['gun', 'rope']);
    expect(getCategoryElements(project, 'nope')).toEqual([]);
  });
});

describe('elementMatchId', () => {
  it('is the id for cast, the name for others (falling back to the id)', () => {
    expect(elementMatchId({ id: '1', name: 'GEORGE' }, 'cast')).toBe('1');
    expect(elementMatchId({ id: 'gun', name: 'gun' }, 'props')).toBe('gun');
    expect(elementMatchId({ id: 'x', name: '' } as any, 'props')).toBe('x');
  });
});

describe('elementKey', () => {
  it('prefers id, then name, then the __new__ sentinel', () => {
    expect(elementKey({ id: '1', name: 'G' })).toBe('1');
    expect(elementKey({ id: '', name: 'G' })).toBe('G');
    expect(elementKey({ id: '', name: '' } as any)).toBe('__new__');
  });
});

describe('countOccurrences', () => {
  it('counts per scene, case-insensitively, splitting multi-value fields', () => {
    const scenes = [{ cast: '1, 2' }, { cast: '1' }, {}];
    const cast = countOccurrences(scenes, 'cast', true);
    expect(cast.get('1')).toBe(2);
    expect(cast.get('2')).toBe(1);

    const props = [{ props: 'gun, rope' }, { props: 'Gun' }];
    const c = countOccurrences(props, 'props', false);
    expect(c.get('gun')).toBe(2);
    expect(c.get('rope')).toBe(1);
  });
});
