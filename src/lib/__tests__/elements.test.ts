import { describe, it, expect } from 'vitest';
import { isIdKeyed, elementMatchId, resolveTypedElementKey, boardIdOf, nextBoardId, isDuplicateBoardId, compareBoardIds } from '../elements';

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

/**
 * Roadmap 257 — one Board ID per element: cast's id, `ProjectElement.boardId`
 * for every other category. Numbers are labels; allocation continues after the
 * highest and never reuses a gap.
 */
describe('Board IDs', () => {
  it('boardIdOf reads cast ids and non-cast boardId', () => {
    expect(boardIdOf({ id: '2', name: 'MARY' }, 'cast')).toBe('2');
    expect(boardIdOf({ id: 'GUN', name: 'GUN', boardId: '7' }, 'props')).toBe('7');
    expect(boardIdOf({ id: 'GUN', name: 'GUN' }, 'props')).toBe('');
  });

  it('nextBoardId continues after the highest, skipping used numbers', () => {
    expect(nextBoardId([])).toBe('1');
    expect(nextBoardId(['1', '2', '3'])).toBe('4');
    // Gaps are NOT filled: 2 is free but the contract says "after the highest".
    expect(nextBoardId(['1', '3'])).toBe('4');
    expect(nextBoardId(['1', '2', '4'])).toBe('5');
    // Unusable values never win the max; leading zeros normalise.
    expect(nextBoardId(['', 'abc', '007'])).toBe('8');
    // A number above a gap is still the max.
    expect(nextBoardId(['3', '10', '4'])).toBe('11');
  });

  it('isDuplicateBoardId compares numerically and ignores the edited row', () => {
    const props = [
      { id: 'A', name: 'A', boardId: '7' },
      { id: 'B', name: 'B', boardId: '8' },
      { id: 'C', name: 'C' },
    ];
    expect(isDuplicateBoardId(props, 'props', '7')).toBe(true);
    expect(isDuplicateBoardId(props, 'props', '07')).toBe(true);
    expect(isDuplicateBoardId(props, 'props', '9')).toBe(false);
    expect(isDuplicateBoardId(props, 'props', '7', 'A')).toBe(false);
    expect(isDuplicateBoardId(props, 'props', '', 'B')).toBe(false);
  });

  it('compareBoardIds sorts numerically with blanks last', () => {
    const values = ['10', '', '2', '1', 'x'];
    expect(values.sort(compareBoardIds)).toEqual(['1', '2', '10', '', 'x']);
  });
});
