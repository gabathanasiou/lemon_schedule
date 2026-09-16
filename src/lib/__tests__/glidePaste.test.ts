import { describe, it, expect } from 'vitest';
import { expandRangeFill } from '../glidePaste';

const COLUMNS = [{ key: 'id' }, { key: 'name' }, { key: 'call' }, { key: 'actions' }];

/** Roadmap 139 — a single edit committed over a multi-cell selection. */
describe('glidePaste — expandRangeFill', () => {
  it('fills every row of a rect down one column', () => {
    const out = expandRangeFill({ x: 2, y: 1, width: 1, height: 3 }, COLUMNS, '07:30');
    expect(out).toEqual([
      { row: 1, colKey: 'call', val: '07:30' },
      { row: 2, colKey: 'call', val: '07:30' },
      { row: 3, colKey: 'call', val: '07:30' },
    ]);
  });

  it('spans multiple columns and skips the actions column', () => {
    const out = expandRangeFill({ x: 0, y: 0, width: 4, height: 1 }, COLUMNS, 'x');
    expect(out.map(e => e.colKey)).toEqual(['id', 'name', 'call']);
  });

  it('restricts the spread to one column when asked (heterogeneous grids)', () => {
    const out = expandRangeFill({ x: 0, y: 0, width: 3, height: 2 }, COLUMNS, 'v', 1);
    expect(out).toEqual([
      { row: 0, colKey: 'name', val: 'v' },
      { row: 1, colKey: 'name', val: 'v' },
    ]);
  });
});
