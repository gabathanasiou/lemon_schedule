import { describe, it, expect } from 'vitest';
import {
  CREW_TARGET,
  LOCATION_TARGET,
  draftRowsFromLinks,
  draftValueForLink,
  flattenLinkRows,
  targetFromDraftValue,
} from '../linkDrafts';
import type { Link } from '../../types';

const link = (over: Partial<Link>): Link => ({
  id: 'l',
  anchorKind: 'element',
  anchorCategory: 'set',
  anchorValue: 'STAGE 2',
  linkedKind: 'element',
  linkedCategory: 'props',
  linkedValue: 'GUN',
  ...over,
});

describe('link draft translation', () => {
  it('maps crew rows to person links and dept tokens to department links', () => {
    expect(targetFromDraftValue(CREW_TARGET, 'p1')).toEqual({ linkedKind: 'crew', linkedValue: 'p1' });
    expect(targetFromDraftValue(CREW_TARGET, 'dept:Camera')).toEqual({ linkedKind: 'department', linkedValue: 'Camera' });
    expect(targetFromDraftValue(LOCATION_TARGET, 'loc1')).toEqual({ linkedKind: 'location', linkedValue: 'loc1' });
    expect(targetFromDraftValue('props', 'GUN')).toEqual({ linkedKind: 'element', linkedCategory: 'props', linkedValue: 'GUN' });
  });

  it('maps canonical links back into draft values', () => {
    expect(draftValueForLink(link({ linkedKind: 'crew', linkedCategory: undefined, linkedValue: 'p1' })))
      .toEqual({ category: CREW_TARGET, value: 'p1' });
    expect(draftValueForLink(link({ linkedKind: 'department', linkedCategory: undefined, linkedValue: 'Camera' })))
      .toEqual({ category: CREW_TARGET, value: 'dept:Camera' });
    expect(draftValueForLink(link({ linkedKind: 'location', linkedCategory: undefined, linkedValue: 'loc1' })))
      .toEqual({ category: LOCATION_TARGET, value: 'loc1' });
    expect(draftValueForLink(link({}))).toEqual({ category: 'props', value: 'GUN' });
  });

  it('flattens one crew row into person + department links', () => {
    const out = flattenLinkRows('set', 'STAGE 2', [
      { id: 'r1', linkedCategory: CREW_TARGET, linkedValue: 'p1, dept:Camera, p2' },
    ]);
    expect(out.map(l => ({ kind: l.linkedKind, value: l.linkedValue }))).toEqual([
      { kind: 'crew', value: 'p1' },
      { kind: 'department', value: 'Camera' },
      { kind: 'crew', value: 'p2' },
    ]);
    expect(out.every(l => l.anchorKind === 'element' && l.anchorValue === 'STAGE 2')).toBe(true);
  });

  it('round-trips a card through drafts without losing a department tag', () => {
    const links = [
      link({ id: 'a', linkedKind: 'crew', linkedCategory: undefined, linkedValue: 'p1' }),
      link({ id: 'b', linkedKind: 'department', linkedCategory: undefined, linkedValue: 'Camera' }),
      link({ id: 'c', linkedKind: 'location', linkedCategory: undefined, linkedValue: 'loc1' }),
      link({ id: 'd' }),
    ];
    const rows = draftRowsFromLinks(links, 'set', 'STAGE 2');
    expect(rows.map(r => ({ cat: r.linkedCategory, value: r.linkedValue }))).toEqual([
      { cat: CREW_TARGET, value: 'p1, dept:Camera' },
      { cat: LOCATION_TARGET, value: 'loc1' },
      { cat: 'props', value: 'GUN' },
    ]);
    const round = flattenLinkRows('set', 'STAGE 2', rows);
    expect(round.map(l => ({ kind: l.linkedKind, cat: l.linkedCategory, value: l.linkedValue }))).toEqual([
      { kind: 'crew', cat: undefined, value: 'p1' },
      { kind: 'department', cat: undefined, value: 'Camera' },
      { kind: 'location', cat: undefined, value: 'loc1' },
      { kind: 'element', cat: 'props', value: 'GUN' },
    ]);
  });

  it('dedupes a repeated department token, case-insensitively', () => {
    const out = flattenLinkRows('set', 'STAGE 2', [
      { id: 'r1', linkedCategory: CREW_TARGET, linkedValue: 'dept:Camera, dept:camera' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ linkedKind: 'department', linkedValue: 'Camera' });
  });
});
