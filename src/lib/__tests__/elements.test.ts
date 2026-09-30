import { describe, it, expect } from 'vitest';
import { isIdKeyed, elementMatchId, resolveTypedElementKey } from '../elements';

/**
 * AGENTS.md §Cast & Entities — the STRICT cast-vs-elements storage rule:
 * `scene.cast` holds Board IDs; every other category holds names. These are
 * the canonical helpers; hand-rolled `isCast ? id : name` branches are banned.
 */
describe('cast is id-keyed, every other category is name-keyed', () => {
  it('isIdKeyed only for cast', () => {
    expect(isIdKeyed('cast')).toBe(true);
    expect(isIdKeyed('props')).toBe(false);
  });

  it('elementMatchId returns the id for cast, the name otherwise', () => {
    expect(elementMatchId({ id: '2', name: 'MARY' }, 'cast')).toBe('2');
    expect(elementMatchId({ id: 'GUN', name: 'GUN' }, 'props')).toBe('GUN');
    expect(elementMatchId({ id: 'x', name: 'Rifle' }, 'props')).toBe('Rifle');
  });
});

describe('resolveTypedElementKey', () => {
  const items = [{ id: '2', name: 'MARY' }, { id: '5', name: 'GEORGE' }, { id: '7', name: '' }];

  it('binds a typed cast NAME to the existing member id (never duplicates)', () => {
    expect(resolveTypedElementKey(items, 'id', 'MARY')).toBe('2');
    expect(resolveTypedElementKey(items, 'id', 'mary')).toBe('2');
    expect(resolveTypedElementKey(items, 'id', ' MARY ')).toBe('2');
  });

  it('an exact Board ID wins, and an unknown name stays new', () => {
    expect(resolveTypedElementKey(items, 'id', '5')).toBe('5');
    expect(resolveTypedElementKey(items, 'id', 'NEW PERSON')).toBe('NEW PERSON');
    expect(resolveTypedElementKey(items, 'id', '7')).toBe('7');
  });

  it('name-keyed categories keep the raw text', () => {
    expect(resolveTypedElementKey(items, 'name', 'MARY')).toBe('MARY');
    expect(resolveTypedElementKey(items, 'name', 'mary')).toBe('mary');
  });
});
