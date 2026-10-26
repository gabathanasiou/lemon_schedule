import { describe, it, expect } from 'vitest';
import {
  CREW_LINK_TARGET,
  crewPersonIdOf,
  dedupeLinks,
  elementSideOf,
  getCrewPersonLinks,
  getElementIncomingLinks,
  getElementOutgoingLinks,
  getOutgoingLinks,
  isPropagationLink,
  migrateProjectLinks,
} from '../links';
import type { Link } from '../../types';

const link = (partial: Partial<Link>): Link => ({
  id: 'l',
  anchorKind: 'element',
  anchorCategory: 'props',
  anchorValue: 'GUN',
  linkedKind: 'element',
  linkedCategory: 'vehicles',
  linkedValue: 'CAR',
  ...partial,
});

describe('unified link matching', () => {
  it('only element→element links propagate', () => {
    expect(isPropagationLink(link({}))).toBe(true);
    expect(isPropagationLink(link({ linkedKind: 'crew', linkedCategory: undefined, linkedValue: 'bob' }))).toBe(false);
    expect(isPropagationLink(link({ anchorKind: 'crew', anchorCategory: undefined, anchorValue: 'bob' }))).toBe(false);
    expect(isPropagationLink(link({ linkedKind: 'location', linkedCategory: undefined, linkedValue: 'loc1' }))).toBe(false);
  });

  it('element values match case-insensitively except cast Board IDs', () => {
    const links = [
      link({}),
      link({ anchorCategory: 'cast', anchorValue: '7', linkedCategory: 'cast', linkedValue: '9' }),
    ];
    expect(getOutgoingLinks(links, 'element', 'props', 'gun')).toHaveLength(1);
    expect(getOutgoingLinks(links, 'element', 'cast', '7')).toHaveLength(1);
    expect(getOutgoingLinks(links, 'element', 'cast', '07')).toHaveLength(0);
  });

  it('outgoing/incoming read both sides of the same record', () => {
    const links = [link({})];
    expect(getElementOutgoingLinks(links, 'props', 'GUN', 'element')).toHaveLength(1);
    expect(getElementIncomingLinks(links, 'vehicles', 'car', 'element')).toHaveLength(1);
    expect(getElementIncomingLinks(links, 'vehicles', 'boat')).toHaveLength(0);
  });

  it('crew person links resolve whichever side holds the person', () => {
    const fromElement = link({ linkedKind: 'crew', linkedCategory: undefined, linkedValue: 'bob' });
    const fromPerson = link({ anchorKind: 'crew', anchorCategory: undefined, anchorValue: 'alice', linkedKind: 'crew', linkedValue: 'bob' });
    const links = [fromElement, fromPerson];
    expect(getCrewPersonLinks(links, 'bob')).toHaveLength(2);
    expect(getCrewPersonLinks(links, 'alice')).toHaveLength(1);
    expect(crewPersonIdOf(fromElement)).toBe('bob');
    expect(elementSideOf(fromElement)).toEqual({ category: 'props', value: 'GUN' });
    expect(elementSideOf(fromPerson)).toBeNull();
  });

  it('dedupes exact duplicates, keeping the first record', () => {
    const a = link({ id: 'a' });
    const b = link({ id: 'b', anchorValue: 'gun' });
    expect(dedupeLinks([a, b]).map(l => l.id)).toEqual(['a']);
  });
});

describe('migrateProjectLinks', () => {
  it('converts elementLinks into element→element links and drops the legacy field', () => {
    const project: any = {
      elementLinks: [{ id: 'e1', anchorCategory: 'props', anchorValue: 'GUN', linkedCategory: 'vehicles', linkedValue: 'CAR' }],
    };
    expect(migrateProjectLinks(project)).toBe(true);
    expect(project.elementLinks).toBeUndefined();
    expect(project.links).toEqual([{
      id: 'e1', anchorKind: 'element', anchorCategory: 'props', anchorValue: 'GUN',
      linkedKind: 'element', linkedCategory: 'vehicles', linkedValue: 'CAR',
    }]);
  });

  it('flips crew links: element→person for element targets, person→person for crew targets', () => {
    const project: any = {
      crewLinks: [
        { id: 'c1', personId: 'bob', category: 'props', elementKey: 'GUN' },
        { id: 'c2', personId: 'bob', category: CREW_LINK_TARGET, elementKey: 'alice' },
      ],
    };
    migrateProjectLinks(project);
    expect(project.crewLinks).toBeUndefined();
    expect(project.links).toEqual([
      { id: 'c1', anchorKind: 'element', anchorCategory: 'props', anchorValue: 'GUN', linkedKind: 'crew', linkedValue: 'bob' },
      { id: 'c2', anchorKind: 'crew', anchorValue: 'bob', linkedKind: 'crew', linkedValue: 'alice' },
    ]);
    expect(isPropagationLink(project.links[0])).toBe(false);
  });

  it('is idempotent and merges late legacy records without duplicates', () => {
    const project: any = {
      elementLinks: [{ id: 'e1', anchorCategory: 'props', anchorValue: 'GUN', linkedCategory: 'vehicles', linkedValue: 'CAR' }],
    };
    expect(migrateProjectLinks(project)).toBe(true);
    expect(migrateProjectLinks(project)).toBe(false);
    expect(project.links).toHaveLength(1);

    // An older peer writes the legacy shape again; the next load merges it.
    project.elementLinks = [
      { id: 'dup', anchorCategory: 'props', anchorValue: 'gun', linkedCategory: 'vehicles', linkedValue: 'car' },
      { id: 'new', anchorCategory: 'props', anchorValue: 'ROPE', linkedCategory: 'vehicles', linkedValue: 'CAR' },
    ];
    expect(migrateProjectLinks(project)).toBe(true);
    expect(project.links.map((l: Link) => l.id)).toEqual(['e1', 'new']);
  });
});
