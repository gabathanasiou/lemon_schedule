import { describe, it, expect } from 'vitest';
import { filterGlideRows, sceneFilterValues } from '../glideFilter';

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

describe('sceneFilterValues (roadmap 172)', () => {
  const cast = new Map([['1', 'GEORGE'], ['2', 'MARY']]);
  const scene = {
    id: 'uuid-should-not-match',
    ghostOf: 'uuid-ghost',
    duplicateOf: 'uuid-parent',
    cutAnchor: 'SCRIPT FRAGMENT',
    sceneNumber: '12',
    sheetNumber: '12A',
    scriptPageNumbers: '21-24',
    pageCount: '2 3/8',
    pageCountDecimal: 2.375,
    scriptDay: '1928',
    intExt: 'INT',
    set: 'DRUGSTORE',
    location: 'Stage 1',
    dayNight: 'NIGHT',
    description: 'George buys luggage.',
    cast: '1, 2',
    notes: 'Overnight bag',
    props: 'Suitcase',
    unit: 'VisFX Unit',
  };

  it('collects every scene field, not just the on-screen columns', () => {
    const values = sceneFilterValues(scene, cast);
    for (const expected of ['12A', '21-24', '2.375', 'Stage 1', 'VisFX Unit', 'Suitcase']) {
      expect(values).toContain(expected);
    }
  });

  it("adds cast names next to their Board IDs (displayed '1. GEORGE')", () => {
    const values = sceneFilterValues(scene, cast);
    expect(values).toContain('1 GEORGE');
    expect(values).toContain('2 MARY');
  });

  it('never searches internal ids or the script fragment', () => {
    const values = sceneFilterValues(scene, cast);
    expect(values.some(v => v.includes('uuid'))).toBe(false);
    expect(values).not.toContain('SCRIPT FRAGMENT');
  });
});
