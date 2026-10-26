import { describe, it, expect } from 'vitest';
import { matchRecord, parseSearchTags, searchManagerRecords, type ManagerSearchRecord } from '../managerSearch';

const record = (over: Partial<ManagerSearchRecord>): ManagerSearchRecord => ({
  categoryKey: 'camera',
  categoryLabel: 'Camera',
  rowKey: 'p1',
  label: 'ROY',
  fields: [
    { key: 'phone', label: 'Phone', value: '(555) 123-4567' },
    { key: 'email', label: 'Email', value: 'roy@example.com' },
  ],
  ...over,
});

describe('parseSearchTags', () => {
  it('splits on commas, trims and lowercases; drops empty segments', () => {
    expect(parseSearchTags(' Roy, 555 ,, CAMERA ')).toEqual(['roy', '555', 'camera']);
    expect(parseSearchTags('   ')).toEqual([]);
  });
});

describe('matchRecord', () => {
  it('matches the label, category and every field, case-insensitively', () => {
    expect(matchRecord(record({}), ['roy']).matched).toBe(true);
    expect(matchRecord(record({}), ['camera']).matched).toBe(true);
    expect(matchRecord(record({}), ['555']).matched).toBe(true);
    expect(matchRecord(record({}), ['example.com']).matched).toBe(true);
    expect(matchRecord(record({}), ['nope']).matched).toBe(false);
  });

  it('requires every comma tag (AND)', () => {
    expect(matchRecord(record({}), ['roy', '555']).matched).toBe(true);
    expect(matchRecord(record({}), ['roy', 'nope']).matched).toBe(false);
    expect(matchRecord(record({}), ['camera', 'roy@']).matched).toBe(true);
  });

  it('shows a field snippet only when the row label is not the match', () => {
    expect(matchRecord(record({}), ['roy']).detail).toBeUndefined();
    expect(matchRecord(record({}), ['555']).detail).toBe('Phone: (555) 123-4567');
    expect(matchRecord(record({}), ['example']).detail).toBe('Email: roy@example.com');
  });

  it('does not match an empty query', () => {
    expect(matchRecord(record({}), []).matched).toBe(false);
  });
});

describe('searchManagerRecords', () => {
  it('returns one hit per matching record in input order', () => {
    const hits = searchManagerRecords([
      record({ rowKey: 'p1', label: 'ROY' }),
      record({ rowKey: 'p2', label: 'DANA', fields: [{ key: 'phone', label: 'Phone', value: '555 0000' }] }),
      record({ rowKey: 'p3', label: 'MAT', fields: [] }),
    ], '555');
    expect(hits.map(h => h.rowKey)).toEqual(['p1', 'p2']);
    expect(hits[0]).toMatchObject({ categoryLabel: 'Camera', label: 'ROY' });
  });

  it('can match across categories', () => {
    const hits = searchManagerRecords([
      record({ categoryKey: 'a', categoryLabel: 'Cast', rowKey: '1', label: 'ROY', fields: [] }),
      record({ categoryKey: 'b', categoryLabel: 'Props', rowKey: 'gun', label: 'GUN', fields: [{ key: 'note', label: 'Note', value: 'Roy’s gun' }] }),
    ], 'roy');
    expect(hits.map(h => h.categoryKey)).toEqual(['a', 'b']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchManagerRecords([record({})], '  ')).toEqual([]);
  });
});
