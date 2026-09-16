import { describe, it, expect } from 'vitest';
import {
  applyItemAffixes,
  parseToken,
  composeTokenKey,
  composeLookupKey,
  parseLookupKey,
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
