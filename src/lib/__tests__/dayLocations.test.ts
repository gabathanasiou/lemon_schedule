import { describe, it, expect } from 'vitest';
import {
  addDayLocation,
  dayLocationRefs,
  removeDayLocation,
  replaceDayLocation,
  setDayMaster,
} from '../dayLocations';
import type { DayMeta } from '../../types';

describe('dayLocationRefs', () => {
  it('keeps the stored order and flags the master', () => {
    const meta: DayMeta = { locationId: 'b', locationIds: ['a', 'b', 'c'] };
    expect(dayLocationRefs(meta)).toEqual([
      { id: 'a', isMaster: false },
      { id: 'b', isMaster: true },
      { id: 'c', isMaster: false },
    ]);
  });

  it('keeps the master in its stored position and dedupes blanks', () => {
    expect(dayLocationRefs({ locationId: 'unit', locationIds: ['set', 'unit', ''] })).toEqual([
      { id: 'set', isMaster: false },
      { id: 'unit', isMaster: true },
    ]);
  });

  it('prepends a legacy master missing from locationIds', () => {
    expect(dayLocationRefs({ locationId: 'unit', locationIds: ['set'] })).toEqual([
      { id: 'unit', isMaster: true },
      { id: 'set', isMaster: false },
    ]);
  });

  it('no master / no list is empty', () => {
    expect(dayLocationRefs({})).toEqual([]);
  });
});

describe('addDayLocation', () => {
  it('appends and makes the FIRST location the master', () => {
    expect(addDayLocation({}, 'a')).toEqual({ locationId: 'a', locationIds: ['a'] });
    expect(addDayLocation({ locationId: 'a', locationIds: ['a'] }, 'b')).toEqual({
      locationId: 'a',
      locationIds: ['a', 'b'],
    });
  });

  it('is a no-op for an already attached id', () => {
    expect(addDayLocation({ locationId: 'a', locationIds: ['a', 'b'] }, 'b')).toEqual({});
  });
});

describe('setDayMaster', () => {
  it('points the master without reordering', () => {
    const meta: DayMeta = { locationId: 'a', locationIds: ['a', 'b', 'c'] };
    expect(setDayMaster(meta, 'c')).toEqual({ locationId: 'c', locationIds: ['a', 'b', 'c'] });
  });

  it('clears the master but keeps the row attached', () => {
    expect(setDayMaster({ locationId: 'a', locationIds: ['a', 'b'] }, undefined)).toEqual({
      locationId: undefined,
      locationIds: ['a', 'b'],
    });
  });

  it('attaches an unknown id so the pointer never dangles', () => {
    expect(setDayMaster({ locationIds: ['a'] }, 'b')).toEqual({ locationId: 'b', locationIds: ['a', 'b'] });
  });
});

describe('removeDayLocation', () => {
  it('drops the row and clears a removed master (no implicit promotion)', () => {
    expect(removeDayLocation({ locationId: 'a', locationIds: ['a', 'b'] }, 'a')).toEqual({
      locationId: undefined,
      locationIds: ['b'],
    });
  });

  it('keeps the master when another row is removed; empty list clears', () => {
    expect(removeDayLocation({ locationId: 'a', locationIds: ['a', 'b'] }, 'b')).toEqual({
      locationId: 'a',
      locationIds: ['a'],
    });
    expect(removeDayLocation({ locationId: 'a', locationIds: ['a'] }, 'a')).toEqual({
      locationId: undefined,
      locationIds: undefined,
    });
  });
});

describe('replaceDayLocation', () => {
  it('swaps in place and carries the master role', () => {
    expect(replaceDayLocation({ locationId: 'b', locationIds: ['a', 'b', 'c'] }, 'b', 'z')).toEqual({
      locationId: 'z',
      locationIds: ['a', 'z', 'c'],
    });
  });

  it('moves the row to the end when the old id is not attached', () => {
    expect(replaceDayLocation({ locationId: 'a', locationIds: ['a'] }, 'gone', 'z')).toEqual({
      locationId: 'a',
      locationIds: ['a', 'z'],
    });
  });

  it('dedupes a target that was already attached elsewhere', () => {
    expect(replaceDayLocation({ locationId: 'a', locationIds: ['a', 'b', 'c'] }, 'c', 'b')).toEqual({
      locationId: 'a',
      locationIds: ['a', 'b'],
    });
  });

  it('is a no-op for the same id', () => {
    expect(replaceDayLocation({ locationId: 'a', locationIds: ['a'] }, 'a', 'a')).toEqual({});
  });
});
