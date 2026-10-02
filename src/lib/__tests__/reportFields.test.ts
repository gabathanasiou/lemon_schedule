import { describe, it, expect } from 'vitest';
import {
  applyItemAffixes,
  parseToken,
  composeTokenKey,
  composeLookupKey,
  parseLookupKey,
  elementLookupKey,
  splitElementLookupKey,
  lookupIdentityField,
  lookupAttributeFields,
  buildLookupTokens,
  fieldsForScope,
  searchReportFields,
} from '../reportFields';

describe('applyItemAffixes', () => {
  it('applies prefix/suffix to every item', () => {
    expect(applyItemAffixes('gun, rope', { itemPrefix: '· ', itemSuffix: '!' })).toBe('· gun!, · rope!');
  });

  it('defaults the separator to ", " and honors an explicit one', () => {
    expect(applyItemAffixes('a, b', {})).toBe('a, b');
    expect(applyItemAffixes('a, b', { itemSeparator: '; ' })).toBe('a; b');
  });

  it('trims parts and leaves an empty value untouched', () => {
    expect(applyItemAffixes(' a , b ', {})).toBe('a, b');
    expect(applyItemAffixes('', {})).toBe('');
  });
});

describe('parseToken / composeTokenKey', () => {
  it('parses a bare field with no opts', () => {
    expect(parseToken('cast')).toEqual({ field: 'cast', opts: {} });
  });

  it('parses piped opts in prefix/suffix/separator order', () => {
    expect(parseToken('cast|· ||; ')).toEqual({
      field: 'cast',
      opts: { itemPrefix: '· ', itemSuffix: '', itemSeparator: '; ' },
    });
    // missing trailing pipes default to empty
    expect(parseToken('cast|X')).toEqual({ field: 'cast', opts: { itemPrefix: 'X', itemSuffix: '', itemSeparator: '' } });
  });

  it('compose omits pipes when every opt is empty, else round-trips', () => {
    expect(composeTokenKey('cast', '', '', '')).toBe('cast');
    expect(parseToken(composeTokenKey('cast', '· ', '', '; '))).toEqual({
      field: 'cast',
      opts: { itemPrefix: '· ', itemSuffix: '', itemSeparator: '; ' },
    });
  });
});

describe('composeLookupKey / parseLookupKey', () => {
  it('round-trips a lookup token', () => {
    expect(parseLookupKey(composeLookupKey('crew', 'role', 'p1'))).toEqual({ collection: 'crew', field: 'role', itemKey: 'p1' });
  });

  it('encodes item keys with special characters (and keeps dots)', () => {
    for (const itemKey of ['a:b', 'a b', 'loc/7', 'a.b', '100%']) {
      const parsed = parseLookupKey(composeLookupKey('locations', 'locationName', itemKey));
      expect(parsed?.itemKey).toBe(itemKey);
    }
  });

  it('rejects non-lookup and too-short keys', () => {
    expect(parseLookupKey('cast')).toBeNull();
    expect(parseLookupKey('lookup.days')).toBeNull();
    expect(parseLookupKey('lookup.days.dayDate')).toBeNull();
  });
});

describe('element lookup keys', () => {
  it('round-trips the category + match id', () => {
    expect(splitElementLookupKey(elementLookupKey('cast', '2'))).toEqual({ category: 'cast', matchId: '2' });
    expect(splitElementLookupKey(elementLookupKey('props', 'Gun 1'))).toEqual({ category: 'props', matchId: 'Gun 1' });
  });
});

describe('lookupIdentityField / lookupAttributeFields', () => {
  const fields = [
    { key: 'crewName', label: 'Name', group: 'Crew', scope: 'crew' },
    { key: 'phone', label: 'Phone', group: 'Crew', scope: 'crew' },
    { key: 'elementName', label: 'Name', group: 'Elements', scope: 'elements' },
    { key: 'attachedScenes', label: 'Attached Scenes List', group: 'Elements', scope: 'elements' },
    { key: 'id', label: 'Cast ID', group: 'Cast & Talent', scope: 'cast' },
    { key: 'sceneNumber', label: 'Scene #', group: 'Scene Info', scope: 'scenes' },
  ] as any[];

  it('maps each collection to its identity field', () => {
    expect(lookupIdentityField('crew')).toBe('crewName');
    expect(lookupIdentityField('scenes')).toBe('sceneLabel');
    expect(lookupIdentityField('elements')).toBe('elementName');
  });

  it('offers exactly the item-scoped attributes (identity excluded)', () => {
    expect(lookupAttributeFields(fields, 'crew').map(f => f.key)).toEqual(['phone']);
    expect(lookupAttributeFields(fields, 'elements', 'props').map(f => f.key)).toEqual(['attachedScenes']);
    // cast adds its own identity fields
    expect(lookupAttributeFields(fields, 'elements', 'cast').map(f => f.key)).toEqual(['attachedScenes', 'id']);
  });
});

describe('fieldsForScope — contextual @ suggestions', () => {
  const fields = [
    { key: 'sceneNumber', label: 'Scene #', group: 'Scene Info', scope: 'scenes' },
    { key: 'cast', label: 'Cast Members List', group: 'Breakdown', scope: 'scenes' },
    { key: 'dayCallTime', label: 'Call Time', group: 'Days', scope: 'days' },
    { key: 'locationName', label: 'Name', group: 'Locations', scope: 'locations' },
    { key: 'phone', label: 'Phone', group: 'Crew', scope: 'crew' },
    { key: 'elementName', label: 'Name', group: 'Elements', scope: 'elements' },
    { key: 'id', label: 'Cast ID', group: 'Cast & Talent', scope: 'cast' },
    { key: 'totalShootDays', label: 'Total Shoot Days', group: 'Production', scope: 'production' },
  ] as any[];

  it('top level offers universal scopes only (no repeat-dependent fields)', () => {
    expect(fieldsForScope(fields, undefined).map(f => f.key)).toEqual(['totalShootDays']);
  });

  it('a days context adds day fields, scene Breakdown fields and locations', () => {
    const keys = fieldsForScope(fields, 'days').map(f => f.key);
    expect(keys).toContain('dayCallTime');
    expect(keys).toContain('cast');
    expect(keys).toContain('locationName');
    expect(keys).not.toContain('sceneNumber'); // Scene Info needs a scene context
    expect(keys).not.toContain('phone');
  });

  it('a crew context adds crew fields only', () => {
    const keys = fieldsForScope(fields, 'crew').map(f => f.key);
    expect(keys).toContain('phone');
    expect(keys).not.toContain('dayCallTime');
  });

  it('a cast element context adds the cast identity fields', () => {
    const keys = fieldsForScope(fields, 'elementsOfCategory', 'cast').map(f => f.key);
    expect(keys).toEqual(['elementName', 'id', 'totalShootDays']);
  });
});

describe('searchReportFields — label, key and group matching', () => {
  const fields = [
    { key: 'counter', label: 'Counter', group: 'Document', scope: 'document' },
    { key: 'pageNumber', label: 'Page Number', group: 'Document', scope: 'document' },
    { key: 'pageSize', label: 'Page Size', group: 'Document', scope: 'document' },
    { key: 'dayCallTime', label: 'Call Time', group: 'Days', scope: 'days' },
  ] as any[];

  it('a group name lists every attribute of that group', () => {
    expect(searchReportFields(fields, 'document').map(f => f.key)).toEqual(['counter', 'pageNumber', 'pageSize']);
  });

  it('still matches labels and keys', () => {
    expect(searchReportFields(fields, 'page').map(f => f.key)).toEqual(['pageNumber', 'pageSize']);
    expect(searchReportFields(fields, 'call').map(f => f.key)).toEqual(['dayCallTime']);
  });
});

describe('buildLookupTokens — stage 1 items only', () => {
  const project = {
    productionInfo: {},
    categoryLabels: {},
    crewRoles: [{ key: 'gaffer', label: 'Gaffer' }],
    crew: { gaffer: [{ id: 'p1', name: 'Bob', phone: '555' }] },
    locations: [{ id: 'loc1', name: 'Main St', type: 'set' }],
    locationTypes: [{ key: 'set', label: 'Set' }],
    dayTypes: [],
    customCategories: [],
    scenes: [{ id: 's1', sceneNumber: '23', set: 'DINER', description: '', intExt: 'INT' }],
    breakdownElements: { props: [{ id: 'e1', name: 'Gun' }] },
    castMembers: [{ id: '2', name: 'MARY' }],
  } as any;
  const items = buildLookupTokens(project, [{ index: 0, chronoDay: 1, date: '2026-01-05' }]);

  it('one entry per item, keyed by the collection identity field', () => {
    expect(items.find(t => t.key === composeLookupKey('crew', 'crewName', 'p1'))?.label).toBe('Bob');
    expect(items.find(t => t.key === composeLookupKey('locations', 'locationName', 'loc1'))?.label).toBe('Main St');
    expect(items.find(t => t.key === composeLookupKey('scenes', 'sceneLabel', 's1'))?.label).toBe('Scene 23');
    expect(items.find(t => t.key === composeLookupKey('days', 'dayLabel', '0'))?.label).toContain('Day 1');
  });

  it('rows carry a contextual hint instead of a generic collection tag', () => {
    expect(items.find(t => t.key === composeLookupKey('crew', 'crewName', 'p1'))?.hint).toBe('Gaffer');
    expect(items.find(t => t.key === composeLookupKey('locations', 'locationName', 'loc1'))?.hint).toBe('Set');
    expect(items.find(t => t.key === composeLookupKey('scenes', 'sceneLabel', 's1'))?.hint).toBe('Scene');
    expect(items.find(t => t.collection === 'categories' && t.itemKey === 'props')?.hint).toBe('Category');
    expect(items.find(t => t.collection === 'locationTypes' && t.itemKey === 'set')?.hint).toBe('Location type');
    expect(items.find(t => t.collection === 'dayTypes')?.hint).toBe('Day type');
    expect(items.find(t => t.collection === 'days')?.hint).toBe('Prod date');
  });

  it('elements carry their category in the item key, entry and hint', () => {
    const gun = items.find(t => t.collection === 'elements' && t.itemKey === elementLookupKey('props', 'Gun'));
    expect(gun?.category).toBe('props');
    expect(gun?.key).toBe(composeLookupKey('elements', 'elementName', elementLookupKey('props', 'Gun')));
    expect(gun?.hint).toBe('Props');
    const mary = items.find(t => t.collection === 'elements' && t.itemKey === elementLookupKey('cast', '2'));
    expect(mary?.category).toBe('cast');
    expect(mary?.label).toBe('MARY');
    expect(mary?.hint).toBe('Cast');
  });

  it('never emits the old flat item · attribute combinations', () => {
    expect(items.some(t => t.field === 'phone')).toBe(false);
  });
});
