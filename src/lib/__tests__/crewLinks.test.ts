import { describe, it, expect } from 'vitest';
import {
  CREW_LINK_TARGET,
  getCrewLinksForPerson,
  getCrewLinksForElement,
  getCrewLinksTargetingPerson,
  linkedElementLabelsForPerson,
  linkedCrewNamesForPerson,
  linkedCrewNamesForElement,
  crewLinkWarnings,
} from '../crewLinks';

function fixture(): any {
  return {
    castMembers: [{ id: '1', name: 'GEORGE' }, { id: '2', name: 'MARY' }],
    breakdownElements: { props: [{ id: 'gun', name: 'gun' }] },
    crewRoles: [{ key: 'driver', label: 'Driver' }],
    crew: {
      driver: [
        { id: 'p-a', name: 'Mat' },
        { id: 'p-b', name: 'Dana' },
      ],
    },
    crewLinks: [
      { id: 'l1', personId: 'p-a', category: 'cast', elementKey: '1' },
      { id: 'l2', personId: 'p-a', category: CREW_LINK_TARGET, elementKey: 'p-b' },
      { id: 'l3', personId: 'p-b', category: 'props', elementKey: 'gun' },
    ],
  };
}

describe('crew link lookups', () => {
  it('filters by anchor person and by target element', () => {
    const p = fixture();
    expect(getCrewLinksForPerson(p.crewLinks, 'p-a').map((l: any) => l.id)).toEqual(['l1', 'l2']);
    expect(getCrewLinksForElement(p.crewLinks, 'cast', '1').map((l: any) => l.id)).toEqual(['l1']);
    // non-cast matching is case-insensitive
    expect(getCrewLinksForElement(p.crewLinks, 'props', 'GUN').map((l: any) => l.id)).toEqual(['l3']);
    // crew→crew links are excluded from the element view
    expect(getCrewLinksForElement(p.crewLinks, CREW_LINK_TARGET, 'p-b')).toEqual([]);
    expect(getCrewLinksTargetingPerson(p.crewLinks, 'p-b').map((l: any) => l.id)).toEqual(['l2']);
  });

  it('resolves labels (cast shows "id. name")', () => {
    const p = fixture();
    expect(linkedElementLabelsForPerson(p, 'p-a')).toBe('1. GEORGE');
    expect(linkedCrewNamesForPerson(p, 'p-a')).toBe('Dana');
    expect(linkedCrewNamesForElement(p, 'props', 'gun')).toBe('Dana');
  });
});

describe('crewLinkWarnings', () => {
  const names = (id: string) => ({ 'p-a': 'Mat', 'p-b': 'Dana' }[id]);
  const label = (l: any) => (l.category === CREW_LINK_TARGET ? 'Dana' : '1. GEORGE');

  it('warns for a linked crew target who is not on the day', () => {
    const warnings = crewLinkWarnings({
      links: [{ id: 'l', personId: 'p-a', category: CREW_LINK_TARGET, elementKey: 'p-b' }],
      dayCrewIds: new Set(['p-a']),
      crewName: names,
      targetLabel: label,
      isElementOnDay: () => true,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].targetKind).toBe('crew');
    expect(warnings[0].message).toBe('Mat is linked to Dana, who is not on this day.');
  });

  it('stays silent when both people are on the day', () => {
    const warnings = crewLinkWarnings({
      links: [{ id: 'l', personId: 'p-a', category: CREW_LINK_TARGET, elementKey: 'p-b' }],
      dayCrewIds: new Set(['p-a', 'p-b']),
      crewName: names,
      targetLabel: label,
      isElementOnDay: () => true,
    });
    expect(warnings).toEqual([]);
  });

  it('warns for an element target missing from the day\'s scenes', () => {
    const warnings = crewLinkWarnings({
      links: [{ id: 'l', personId: 'p-a', category: 'cast', elementKey: '1' }],
      dayCrewIds: new Set(['p-a']),
      crewName: names,
      targetLabel: label,
      isElementOnDay: (_c, key) => key === '2',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].targetKind).toBe('element');
    expect(warnings[0].message).toBe("Mat is linked to 1. GEORGE, who is not in this day's scenes.");
  });

  it('ignores links anchored by people who are not on the day', () => {
    const warnings = crewLinkWarnings({
      links: [{ id: 'l', personId: 'p-b', category: CREW_LINK_TARGET, elementKey: 'p-a' }],
      dayCrewIds: new Set(['p-a']),
      crewName: names,
      targetLabel: () => 'Mat',
      isElementOnDay: () => false,
    });
    expect(warnings).toEqual([]);
  });
});
