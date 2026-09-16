import { describe, it, expect } from 'vitest';
import type { Scene, ScheduleRow } from '../../types';
import { createBlankScene } from '../sceneFactory';
import {
  autoDaybreaks,
  deleteAllDaybreaks,
  insertRow,
  moveRows,
  setStripboardOrder,
  sortRows,
} from '../scheduleOps';

let idCounter = 0;
const nextId = () => `gen-${++idCounter}`;

function withOrders(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.map((r, i) => ({ ...r, order: i }));
}

function scene(id: string, over: Partial<Scene> = {}): Scene {
  return createBlankScene({ sceneNumber: id, ...over });
}

function row(id: string, over: Partial<ScheduleRow> = {}): ScheduleRow {
  return { id, type: 'SCENE', containerId: 1, order: 0, estimatedDuration: 30, ...over };
}

const pinnedDb = (): ScheduleRow => ({ id: 'pinned', type: 'DAYBREAK', containerId: 1, order: 0, pinned: true, daybreakCallTime: '08:00' });
const daybreak = (id: string, callTime = '08:00'): ScheduleRow => ({ id, type: 'DAYBREAK', containerId: 1, order: 0, daybreakCallTime: callTime });

const ids = (rows: ScheduleRow[]) => rows.map(r => r.id);
const stripIds = (rows: ScheduleRow[]) => rows.filter(r => r.containerId !== null).map(r => r.id);

describe('autoDaybreaks', () => {
  it('splits by duration and drops existing daybreaks', () => {
    const scenes = [scene('1'), scene('2'), scene('3')];
    const rows = withOrders([
      pinnedDb(),
      row('r1', { sceneId: scenes[0].id, estimatedDuration: 30 }),
      row('r2', { sceneId: scenes[1].id, estimatedDuration: 30 }),
      row('r3', { sceneId: scenes[2].id, estimatedDuration: 60 }),
      daybreak('old'),
    ]);

    const out = autoDaybreaks(rows, scenes, { mode: 'duration', threshold: 50, notesAction: 'boneyard', breaksAction: 'boneyard' }, nextId);

    expect(out[0].id).toBe('pinned');
    expect(out[0].pinned).toBe(true);
    expect(out.some(r => r.id === 'old')).toBe(false);
    // 3 scene rows that each overflow the 50-min cap -> a break before r2 and r3 + closing break.
    expect(out.filter(r => r.type === 'DAYBREAK').length).toBe(4);
    expect(stripIds(out)).toContain('r1');
  });

  it('splits by page count', () => {
    const scenes = [
      scene('1', { pageCountDecimal: 2 }),
      scene('2', { pageCountDecimal: 2 }),
      scene('3', { pageCountDecimal: 2 }),
    ];
    const rows = withOrders([pinnedDb(), row('r1', { sceneId: scenes[0].id }), row('r2', { sceneId: scenes[1].id }), row('r3', { sceneId: scenes[2].id })]);

    const out = autoDaybreaks(rows, scenes, { mode: 'pages', threshold: 3, notesAction: 'boneyard', breaksAction: 'boneyard' }, nextId);

    expect(out.filter(r => r.type === 'DAYBREAK').length).toBe(4);
  });

  it('boneyards displaced NOTE/BREAK rows and deletes them when asked', () => {
    const scenes = [scene('1'), scene('2')];
    const rows = withOrders([
      pinnedDb(),
      row('r1', { sceneId: scenes[0].id, estimatedDuration: 10 }),
      { id: 'n1', type: 'NOTE', containerId: 1, order: 0, noteText: 'HELLO' },
      { id: 'b1', type: 'BREAK', containerId: 1, order: 0, breakLabel: 'LUNCH', breakDuration: 60 },
      row('r2', { sceneId: scenes[1].id, estimatedDuration: 10 }),
    ]);

    const keep = autoDaybreaks(rows, scenes, { mode: 'duration', threshold: 600, notesAction: 'boneyard', breaksAction: 'boneyard' }, nextId);
    expect(keep.find(r => r.id === 'n1')?.containerId).toBeNull();
    expect(keep.find(r => r.id === 'b1')?.containerId).toBeNull();

    const drop = autoDaybreaks(rows, scenes, { mode: 'duration', threshold: 600, notesAction: 'delete', breaksAction: 'delete' }, nextId);
    expect(drop.some(r => r.id === 'n1')).toBe(false);
    expect(drop.some(r => r.id === 'b1')).toBe(false);
  });

  it('rejects a non-positive threshold', () => {
    expect(() => autoDaybreaks([], [], { mode: 'duration', threshold: 0, notesAction: 'boneyard', breaksAction: 'boneyard' }, nextId)).toThrow(/positive threshold/);
  });
});

describe('deleteAllDaybreaks', () => {
  it('removes non-pinned daybreaks and keeps the pinned one + other rows', () => {
    const rows = withOrders([pinnedDb(), daybreak('d1'), row('r1'), daybreak('d2'), row('r2')]);
    const out = deleteAllDaybreaks(rows);
    expect(ids(out)).toEqual(['pinned', 'r1', 'r2']);
  });

  it('is a no-op shape when only the pinned daybreak exists', () => {
    const rows = withOrders([pinnedDb(), row('r1')]);
    expect(ids(deleteAllDaybreaks(rows))).toEqual(['pinned', 'r1']);
  });
});

describe('moveRows', () => {
  it('moves a row to an index on the stripboard', () => {
    const rows = withOrders([pinnedDb(), row('a'), row('b'), row('c')]);
    const out = moveRows(rows, { rowIds: ['c'], toContainer: 'stripboard', toIndex: 1 });
    expect(stripIds(out)).toEqual(['pinned', 'c', 'a', 'b']);
  });

  it('moves a row to the boneyard and back', () => {
    const rows = withOrders([pinnedDb(), row('a'), row('b')]);
    const out = moveRows(rows, { rowIds: ['a'], toContainer: 'boneyard' });
    expect(out.find(r => r.id === 'a')?.containerId).toBeNull();

    const back = moveRows(out, { rowIds: ['a'], toContainer: 'stripboard', afterRowId: 'pinned' });
    expect(back.find(r => r.id === 'a')?.containerId).toBe(1);
    expect(stripIds(back)).toEqual(['pinned', 'a', 'b']);
  });

  it('never moves the pinned daybreak and clamps inserts below it', () => {
    const rows = withOrders([pinnedDb(), row('a'), row('b')]);
    expect(() => moveRows(rows, { rowIds: ['pinned'], toIndex: 2 })).toThrow(/pinned daybreak/);

    const out = moveRows(rows, { rowIds: ['b'], toContainer: 'stripboard', toIndex: 0 });
    expect(stripIds(out)[0]).toBe('pinned');
  });

  it('moves multiple rows preserving their relative order', () => {
    const rows = withOrders([pinnedDb(), row('a'), row('b'), row('c'), row('d')]);
    const out = moveRows(rows, { rowIds: ['b', 'd'], toContainer: 'stripboard', afterRowId: 'c' });
    expect(stripIds(out)).toEqual(['pinned', 'a', 'c', 'b', 'd']);
  });

  it('rejects unknown ids and clipboard rows', () => {
    const rows = withOrders([pinnedDb(), row('a'), { id: 'clip', type: 'SCENE', containerId: -1, order: 0 }]);
    expect(() => moveRows(rows, { rowIds: ['nope'] })).toThrow(/Unknown row id/);
    expect(() => moveRows(rows, { rowIds: ['clip'] })).toThrow(/clipboard/);
  });
});

describe('insertRow', () => {
  it('inserts a NOTE at an index and assigns container/order', () => {
    const rows = withOrders([pinnedDb(), row('a'), row('b')]);
    const out = insertRow(rows, {
      row: { id: 'n1', type: 'NOTE', noteText: 'HELLO' } as ScheduleRow,
      container: 'stripboard',
      afterRowId: 'pinned',
    });
    expect(stripIds(out)).toEqual(['pinned', 'n1', 'a', 'b']);
    expect(out.find(r => r.id === 'n1')?.containerId).toBe(1);
  });

  it('appends to the boneyard and rejects duplicate ids', () => {
    const rows = withOrders([pinnedDb(), row('a'), row('b', { containerId: null })]);
    const out = insertRow(rows, { row: { id: 'b2', type: 'BREAK', breakLabel: 'LUNCH' } as ScheduleRow, container: 'boneyard' });
    expect(out.find(r => r.id === 'b2')?.containerId).toBeNull();

    expect(() => insertRow(rows, { row: { id: 'a', type: 'NOTE' } as ScheduleRow })).toThrow(/already exists/);
    expect(() => insertRow(rows, { row: { id: 'p2', type: 'DAYBREAK', pinned: true } as ScheduleRow })).toThrow(/pinned/);
  });
});

describe('setStripboardOrder', () => {
  it('applies a full stripboard permutation and forces the pinned row first', () => {
    const rows = withOrders([pinnedDb(), row('a'), row('b'), row('c', { containerId: null })]);
    const out = setStripboardOrder(rows, ['b', 'pinned', 'a']);
    expect(stripIds(out)).toEqual(['pinned', 'b', 'a']);
    expect(out.find(r => r.id === 'c')?.containerId).toBeNull();
  });

  it('validates the permutation', () => {
    const rows = withOrders([pinnedDb(), row('a')]);
    expect(() => setStripboardOrder(rows, ['a'])).toThrow(/must list all/);
    expect(() => setStripboardOrder(rows, ['a', 'ghost'])).toThrow(/Unknown stripboard row id/);
    expect(() => setStripboardOrder(rows, ['a', 'a'])).toThrow(/Duplicate/);
  });
});

describe('sortRows', () => {
  it('sorts hierarchically by set, then day/night, then INT/EXT', () => {
    const scenes = [
      scene('1', { set: 'B', dayNight: 'DAY', intExt: 'INT' }),
      scene('2', { set: 'A', dayNight: 'NIGHT', intExt: 'EXT' }),
      scene('3', { set: 'A', dayNight: 'DAY', intExt: 'EXT' }),
      scene('4', { set: 'A', dayNight: 'DAY', intExt: 'INT' }),
    ];
    const rows = withOrders([
      pinnedDb(),
      row('r1', { sceneId: scenes[0].id }),
      row('r2', { sceneId: scenes[1].id }),
      row('r3', { sceneId: scenes[2].id }),
      row('r4', { sceneId: scenes[3].id }),
    ]);

    const out = sortRows(rows, scenes, {
      criteria: [{ key: 'set' }, { key: 'day_night' }, { key: 'int_ext' }],
      customOrders: { int_ext: ['INT', 'EXT', 'INT/EXT'] },
    });
    expect(stripIds(out)).toEqual(['pinned', 'r4', 'r3', 'r2', 'r1']);
  });

  it('drops daybreaks and honours custom value orders + directions', () => {
    const scenes = [
      scene('1', { intExt: 'EXT' }),
      scene('2', { intExt: 'INT' }),
    ];
    const rows = withOrders([pinnedDb(), daybreak('d1'), row('r1', { sceneId: scenes[0].id }), row('r2', { sceneId: scenes[1].id })]);

    const out = sortRows(rows, scenes, {
      criteria: [{ key: 'int_ext', direction: 'asc' }],
      customOrders: { int_ext: ['INT', 'EXT'] },
    });
    expect(out.some(r => r.type === 'DAYBREAK' && !r.pinned)).toBe(false);
    expect(stripIds(out)).toEqual(['pinned', 'r2', 'r1']);
  });

  it('rejects an empty criteria list', () => {
    expect(() => sortRows([], [], { criteria: [] })).toThrow(/at least one criterion/);
  });
});
