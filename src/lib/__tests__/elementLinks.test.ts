import { describe, it, expect } from 'vitest';
import {
  isLinkableCategory,
  getAnchorLinks,
  anchoredKeysFor,
  fieldContains,
  addValueToField,
  computePropagation,
} from '../elementLinks';
import type { ElementLink, Scene } from '../../types';

const link = (over: Partial<ElementLink>): ElementLink => ({
  id: over.id ?? 'l',
  anchorCategory: over.anchorCategory ?? 'cast',
  anchorValue: over.anchorValue ?? '1',
  linkedCategory: over.linkedCategory ?? 'props',
  linkedValue: over.linkedValue ?? 'GUN',
});

describe('isLinkableCategory', () => {
  it('cast + built-ins are linkable, notes is not', () => {
    expect(isLinkableCategory('cast')).toBe(true);
    expect(isLinkableCategory('props')).toBe(true);
    expect(isLinkableCategory('set')).toBe(true);
    expect(isLinkableCategory('notes')).toBe(false);
  });
  it('custom categories are linkable only when declared', () => {
    const custom = [{ key: 'vibe', label: 'Vibe', multiValue: true }];
    expect(isLinkableCategory('vibe', custom as any)).toBe(true);
    expect(isLinkableCategory('vibe')).toBe(false);
  });
});

describe('getAnchorLinks', () => {
  it('matches cast by exact id', () => {
    const links = [link({ id: 'a', anchorCategory: 'cast', anchorValue: '1' })];
    expect(getAnchorLinks(links, 'cast', '1')).toHaveLength(1);
    expect(getAnchorLinks(links, 'cast', '2')).toHaveLength(0);
  });
  it('matches non-cast names case-insensitively', () => {
    const links = [link({ id: 'a', anchorCategory: 'props', anchorValue: 'Gun' })];
    expect(getAnchorLinks(links, 'props', 'gun')).toHaveLength(1);
    expect(getAnchorLinks(links, 'props', 'GUN')).toHaveLength(1);
  });
  it('returns [] for blank value or empty list', () => {
    expect(getAnchorLinks([], 'cast', '1')).toEqual([]);
    expect(getAnchorLinks([link({})], 'cast', '')).toEqual([]);
  });
});

describe('anchoredKeysFor', () => {
  it('collects anchor values for a category', () => {
    const links = [
      link({ id: 'a', anchorCategory: 'cast', anchorValue: '1' }),
      link({ id: 'b', anchorCategory: 'cast', anchorValue: '2' }),
      link({ id: 'c', anchorCategory: 'props', anchorValue: 'Gun' }),
    ];
    expect(anchoredKeysFor(links, 'cast')).toEqual(new Set(['1', '2']));
    expect(anchoredKeysFor(links, 'props')).toEqual(new Set(['Gun']));
  });
});

describe('fieldContains', () => {
  it('uses id-exact for cast and case-insensitive for names', () => {
    expect(fieldContains('cast', '1, 2', '1')).toBe(true);
    expect(fieldContains('cast', '1, 2', '3')).toBe(false);
    expect(fieldContains('props', 'Gun, Knife', 'gun')).toBe(true);
    expect(fieldContains('props', '', 'gun')).toBe(false);
    expect(fieldContains('props', undefined, 'gun')).toBe(false);
  });
});

describe('addValueToField', () => {
  it('appends + dedupes multi-value fields', () => {
    expect(addValueToField(undefined, 'cast', '1', '2')).toBe('1, 2');
    expect(addValueToField(undefined, 'cast', '1, 2', '2')).toBeNull();
  });
  it('never clobbers an occupied single-value field', () => {
    expect(addValueToField(undefined, 'set', '', 'STAGE')).toBe('STAGE');
    expect(addValueToField(undefined, 'set', 'STAGE', 'OTHER')).toBeNull();
    expect(addValueToField(undefined, 'set', 'STAGE', 'STAGE')).toBeNull();
  });
});

describe('computePropagation', () => {
  it('adds the linked value when an anchor is added to a scene', () => {
    const links = [link({ anchorCategory: 'cast', anchorValue: '1', linkedCategory: 'props', linkedValue: 'GUN' })];
    const before = { cast: '' } as Scene;
    const after = { cast: '1' } as Scene;
    expect(computePropagation(links, undefined, before, after)).toEqual({ props: 'GUN' });
  });

  it('does nothing when no anchor was added, or there are no links', () => {
    const links = [link({ anchorCategory: 'cast', anchorValue: '1' })];
    const same = { cast: '1' } as Scene;
    expect(computePropagation(links, undefined, same, same)).toEqual({});
    expect(computePropagation([], undefined, { cast: '' } as Scene, { cast: '1' } as Scene)).toEqual({});
  });
});
