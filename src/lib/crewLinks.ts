import { CrewLink, Link, Project } from '../types';
import { getCategoryElements, elementMatchId, boardIdOf, boardLabel } from './elements';
import { CREW_LINK_TARGET, getElementOutgoingLinks } from './links';

/**
 * Crew links (roadmap 11/308) — a VIEW over the unified `project.links`
 * store. The canonical record is element-owned (`element → crew`); person →
 * person links are crew-owned (`crew → crew`). This module keeps the legacy
 * `CrewLink` shape for the Crew Manager UI and the report fields, converting
 * on read and back on write (`crewLinkToUnified`).
 *
 * Matching: elements via `elementMatchId` (cast = Board ID, others = name,
 * case-insensitive); people by id.
 */

/** Reserved category meaning "the target is another crew person". */
export { CREW_LINK_TARGET } from './links';

/** One legacy-shaped view per crew-involving link (person-anchored). */
export function crewLinkViews(links: Link[] | undefined): CrewLink[] {
  const out: CrewLink[] = [];
  for (const l of links || []) {
    if (l.anchorKind === 'element' && l.linkedKind === 'crew' && l.anchorCategory) {
      out.push({ id: l.id, personId: l.linkedValue, category: l.anchorCategory, elementKey: l.anchorValue });
    } else if (l.anchorKind === 'crew' && l.linkedKind === 'crew') {
      out.push({ id: l.id, personId: l.anchorValue, category: CREW_LINK_TARGET, elementKey: l.linkedValue });
    } else if (l.anchorKind === 'crew' && l.linkedKind === 'element' && l.linkedCategory) {
      // Kept for safety on hand-edited files: person anchored to an element.
      out.push({ id: l.id, personId: l.anchorValue, category: l.linkedCategory, elementKey: l.linkedValue });
    }
  }
  return out;
}

/** Canonical unified record for one legacy crew-link row. */
export function crewLinkToUnified(l: CrewLink): Link {
  if (l.category === CREW_LINK_TARGET) {
    return { id: l.id, anchorKind: 'crew', anchorValue: l.personId, linkedKind: 'crew', linkedValue: l.elementKey };
  }
  return {
    id: l.id,
    anchorKind: 'element',
    anchorCategory: l.category,
    anchorValue: l.elementKey,
    linkedKind: 'crew',
    linkedValue: l.personId,
  };
}

/** Links owned by one person (legacy view). */
export function getCrewLinksForPerson(links: Link[] | undefined, personId: string): CrewLink[] {
  if (!links || !personId) return [];
  return crewLinkViews(links).filter(l => l.personId === personId);
}

/** Crew links attached to one element — the per-element view. */
export function getCrewLinksForElement(links: Link[] | undefined, category: string, elementKey: string): CrewLink[] {
  if (!links || !elementKey || category === CREW_LINK_TARGET) return [];
  return crewLinkViews(links).filter(l =>
    l.category === category &&
    (category === 'cast' ? l.elementKey === elementKey : l.elementKey.toLowerCase() === elementKey.toLowerCase()),
  );
}

/** Crew→crew links that point at one person (the reverse view). */
export function getCrewLinksTargetingPerson(links: Link[] | undefined, personId: string): CrewLink[] {
  if (!links || !personId) return [];
  return crewLinkViews(links).filter(l => l.category === CREW_LINK_TARGET && l.elementKey === personId);
}

/** Human label for a linked element — "N. NAME" for every category (roadmap
 *  305), falling back to the stored key. */
export function elementLabelForLink(project: Project, link: CrewLink): string {
  const el = getCategoryElements(project, link.category).find(e =>
    elementMatchId(e, link.category).toLowerCase() === link.elementKey.toLowerCase());
  if (!el) return link.elementKey;
  return boardLabel(boardIdOf(el, link.category), el.name || el.id);
}

/** id → name for every crew person in the project. */
export function crewNameMap(project: Project): Map<string, string> {
  const byId = new Map<string, string>();
  for (const role of project.crewRoles || []) {
    for (const p of project.crew?.[role.key] || []) byId.set(p.id, p.name);
  }
  return byId;
}

/** Resolved target label for a link (element display or crew name). */
export function targetLabelForLink(project: Project, link: CrewLink): string {
  if (link.category === CREW_LINK_TARGET) return crewNameMap(project).get(link.elementKey) || link.elementKey;
  return elementLabelForLink(project, link);
}

/** Resolved element labels a person is linked to (comma-separated) — the
 *  crew item's `linkedElements` report field. Crew targets are excluded. */
export function linkedElementLabelsForPerson(project: Project, personId: string): string {
  return getCrewLinksForPerson(project.links, personId)
    .filter(l => l.category !== CREW_LINK_TARGET)
    .map(l => elementLabelForLink(project, l))
    .join(', ');
}

/** Resolved crew names a person is linked to (comma-separated) — the crew
 *  item's `linkedCrew` report field. */
export function linkedCrewNamesForPerson(project: Project, personId: string): string {
  const byId = crewNameMap(project);
  const names: string[] = [];
  for (const link of getCrewLinksForPerson(project.links, personId)) {
    if (link.category !== CREW_LINK_TARGET) continue;
    const name = byId.get(link.elementKey);
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(', ');
}

/** Resolved crew names linked to an element (comma-separated) — the element's
 *  `linkedCrew` report field. Whole-department tags read "All <department>";
 *  the people they currently cover are intentionally NOT expanded. */
export function linkedCrewNamesForElement(project: Project, category: string, elementKey: string): string {
  const byId = crewNameMap(project);
  const names: string[] = [];
  for (const link of getCrewLinksForElement(project.links, category, elementKey)) {
    const name = byId.get(link.personId);
    if (name && !names.includes(name)) names.push(name);
  }
  for (const link of getElementOutgoingLinks(project.links, category, elementKey, 'department')) {
    const label = `All ${link.linkedValue}`;
    if (!names.includes(label)) names.push(label);
  }
  return names.join(', ');
}

export interface CrewLinkWarning {
  personId: string;
  category: string;
  targetKey: string;
  /** 'crew' = the target is another person; 'element' = an element. */
  targetKind: 'crew' | 'element' | 'department';
  targetLabel: string;
  message: string;
}

/**
 * Dangling-link warnings for ONE day (roadmap 11): a crew person who IS on the
 * day is linked to a target (another crew person or an element) that is NOT on
 * the day — the assignment has nothing to point at, so printing would lie.
 * `isElementOnDay` receives the `elementMatchId` key.
 */
export function crewLinkWarnings(params: {
  links: Link[] | undefined;
  dayCrewIds: ReadonlySet<string>;
  crewName: (id: string) => string | undefined;
  targetLabel: (link: CrewLink) => string;
  isElementOnDay: (category: string, elementKey: string) => boolean;
  /** Current people of a crew department — required to judge department tags. */
  peopleInDept?: (dept: string) => string[];
  /** Display label for the element anchor (department warning copy). */
  elementLabel?: (category: string, elementKey: string) => string;
}): CrewLinkWarning[] {
  const out: CrewLinkWarning[] = [];
  // Whole-department tags: warn when NOBODY from that department is on the day.
  for (const link of params.links || []) {
    if (link.anchorKind !== 'element' || link.linkedKind !== 'department' || !link.anchorCategory) continue;
    const people = params.peopleInDept?.(link.linkedValue) || [];
    if (people.some(id => params.dayCrewIds.has(id))) continue;
    const element = params.elementLabel?.(link.anchorCategory, link.anchorValue) || link.anchorValue;
    out.push({
      personId: '',
      category: 'department',
      targetKey: link.linkedValue,
      targetKind: 'department',
      targetLabel: `All ${link.linkedValue}`,
      message: `${element} is linked to all of ${link.linkedValue}, but nobody from ${link.linkedValue} is on this day.`,
    });
  }
  for (const link of crewLinkViews(params.links)) {
    if (!params.dayCrewIds.has(link.personId)) continue;
    const anchor = params.crewName(link.personId) || link.personId;
    const label = params.targetLabel(link);
    if (link.category === CREW_LINK_TARGET) {
      if (params.dayCrewIds.has(link.elementKey)) continue;
      out.push({
        personId: link.personId,
        category: link.category,
        targetKey: link.elementKey,
        targetKind: 'crew',
        targetLabel: label,
        message: `${anchor} is linked to ${label}, who is not on this day.`,
      });
    } else {
      if (params.isElementOnDay(link.category, link.elementKey)) continue;
      out.push({
        personId: link.personId,
        category: link.category,
        targetKey: link.elementKey,
        targetKind: 'element',
        targetLabel: label,
        message: `${anchor} is linked to ${label}, who is not in this day's scenes.`,
      });
    }
  }
  return out;
}
