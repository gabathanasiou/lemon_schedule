import { describe, it, expect } from 'vitest';
import { filterGlideRows, sceneFilterValues } from '../glideFilter';
import { sceneFilterVocabulary } from '../glideFilterVocabulary';
import type { Project } from '../../types';

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
    for (const expected of ['INT', 'NIGHT', '12A', '21-24', '2.375', 'Stage 1', 'VisFX Unit', 'Suitcase']) {
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

describe('smart whole-word tags (roadmap 172)', () => {
  interface SceneRow {
    name: string;
    text: string;
  }
  const smartRows: SceneRow[] = [
    { name: 'into', text: 'crash into tree' },
    { name: 'point', text: 'point' },
    { name: 'night', text: 'Night shoot' },
    { name: 'overnight', text: 'Overnight bag' },
    { name: 'drugstore', text: 'DRUGSTORE' },
  ];
  const sceneValues = (r: SceneRow) => [r.text];
  const wholeWordTags = new Set(['int', 'night', 'day', 'ext', 'd/e']);
  const names = (query: string) =>
    filterGlideRows(smartRows, query, sceneValues, { wholeWordTags }).map(r => r.name);

  it('matches a known tag only as a whole word', () => {
    expect(names('int')).toEqual([]); // not into / point
    expect(names('night')).toEqual(['night']); // not Overnight
    expect(names('NIGHT')).toEqual(['night']); // case-insensitive
    expect(names('day')).toEqual([]); // not birthday
  });

  it('keeps substring matching for tags that are not in the vocabulary', () => {
    expect(names('drug')).toEqual(['drugstore']);
  });

  it('handles punctuation and mixed whole-word / substring tags', () => {
    const rows: SceneRow[] = [
      { name: 'd/e', text: 'D/E' },
      { name: 'int-night', text: 'INT Night' },
      { name: 'ext-day', text: 'EXT Day' },
      { name: 'drug-night', text: 'BACK ROOM DRUGSTORE, Night' },
    ];
    const pick = (query: string) =>
      filterGlideRows(rows, query, sceneValues, { wholeWordTags }).map(r => r.name);
    expect(pick('d/e')).toEqual(['d/e']);
    expect(pick('int, night')).toEqual(['int-night']);
    expect(pick('drug, night')).toEqual(['drug-night']);
  });
});

describe('sceneFilterVocabulary (roadmap 172)', () => {
  const project = {
    colorPalette: {
      intExtOptions: ['INT', 'EXT', 'D/E'],
      dayNightOptions: ['DAY', 'Magic Hour'],
      sceneColors: [{ intExt: 'MORNING', dayNight: 'EVENING' }],
    },
    castMembers: [{ id: '1', name: 'GEORGE' }],
    breakdownElements: {
      set: [{ id: 's1', name: 'DRUGSTORE' }],
      props: [{ id: 'p1', name: 'Overnight Bag' }],
    },
    locations: [{ id: 'l1', name: 'Stage 1' }],
    scenes: [{ intExt: 'INT/EXT', dayNight: 'NIGHT' }],
  } as unknown as Project;

  it('is derived from colors, the element/cast database, locations and scene values', () => {
    const vocabulary = sceneFilterVocabulary(project);
    expect([...vocabulary]).toEqual(expect.arrayContaining([
      // colors
      'int', 'ext', 'd/e', 'day', 'magic hour', 'morning', 'evening',
      // database + cast
      'george', 'drugstore', 'overnight bag',
      // locations
      'stage 1',
      // values actually used on a scene (legacy safety net)
      'int/ext', 'night',
    ]));
    expect(vocabulary.has('')).toBe(false);
  });
});
