import { describe, it, expect } from 'vitest';
import { filterGlideRows } from '../glideFilter';

interface Row {
  name: string;
  role: string;
  notes?: string;
}

const rows: Row[] = [
  { name: 'ANNA', role: 'Camera', notes: '555-0100' },
  { name: 'BOB', role: 'Grip', notes: '' },
  { name: 'CARA', role: 'Camera', notes: 'night shoot' },
];

const valuesOf = (r: Row) => [r.name, r.role, r.notes || ''];

describe('filterGlideRows (roadmap 172)', () => {
  it('returns every row for an empty / whitespace query', () => {
    expect(filterGlideRows(rows, '', valuesOf)).toEqual(rows);
    expect(filterGlideRows(rows, '   ', valuesOf)).toEqual(rows);
  });

  it('matches case-insensitively across the displayed values', () => {
    expect(filterGlideRows(rows, 'camera', valuesOf).map(r => r.name)).toEqual(['ANNA', 'CARA']);
    expect(filterGlideRows(rows, '555-0100', valuesOf).map(r => r.name)).toEqual(['ANNA']);
  });

  it('ANDs comma-separated tags', () => {
    expect(filterGlideRows(rows, 'cara, night', valuesOf).map(r => r.name)).toEqual(['CARA']);
    expect(filterGlideRows(rows, 'cara, 555-0100', valuesOf)).toEqual([]);
  });

  it('ignores empty comma segments and tolerates missing values', () => {
    expect(filterGlideRows(rows, ' , camera , ', valuesOf).map(r => r.name)).toEqual(['ANNA', 'CARA']);
    expect(filterGlideRows(rows, 'night', r => [r.name, undefined as unknown as string]).map(r => r.name)).toEqual([]);
  });

  it('never mutates or reorders the source rows', () => {
    const source = [...rows];
    filterGlideRows(rows, 'camera', valuesOf);
    expect(rows).toEqual(source);
  });
});
