import { CrewLink, Project } from '../types';
import { getCategoryElements, elementMatchId } from './elements';

/**
 * Crew person ↔ target links (roadmap 11) — one-way, anchor = the crew person.
 * A parallel model to `elementLinks` (whose sides are category+value pairs); a
 * crew anchor is a person id, so overloading `elementLinks` would lose that
 * identity. This module is the single read/write seam: reports, the Crew Links
 * manager and the Element Manager all resolve through it.
 *
 * The target is either an element (cast/other category, matched through
 * `elementMatchId`: cast = Board ID, others = case-insensitive name) or another
 * CREW PERSON (reserved `category = CREW_LINK_TARGET`, `elementKey` = person id)
 * — e.g. "Driver: Mat — for Director" or "Chaperone: Mary — for 13. Alex".
 */

/** Reserved category meaning "the target is another crew person". */
export const CREW_LINK_TARGET = 'crew';

/** Links owned by one person (the anchor). */
export function getCrewLinksForPerson(links: CrewLink[] | undefined, personId: string): CrewLink[] {
  if (!links || !personId) return [];
  return links.filter(l => l.personId === personId);
}

/** Element links that point at one element — the per-element "Linked crew"
 *  view. Crew→crew links are excluded. */
export function getCrewLinksForElement(links: CrewLink[] | undefined, category: string, elementKey: string): CrewLink[] {
  if (!links || !elementKey || category === CREW_LINK_TARGET) return [];
  const target = category === 'cast' ? elementKey : elementKey.toLowerCase();
  return links.filter(l => l.category === category &&
    (category === 'cast' ? l.elementKey === target : l.elementKey.toLowerCase() === target));
}

/** Crew→crew links that point at one person (the reverse view). */
export function getCrewLinksTargetingPerson(links: CrewLink[] | undefined, personId: string): CrewLink[] {
  if (!links || !personId) return [];
  return links.filter(l => l.category === CREW_LINK_TARGET && l.elementKey === personId);
}

/** Human label for a linked element ("1. FISHERMAN" for cast, name otherwise). */
export function elementLabelForLink(project: Project, link: CrewLink): string {
  const el = getCategoryElements(project, link.category).find(e =>
    elementMatchId(e, link.category).toLowerCase() === link.elementKey.toLowerCase());
  if (!el) return link.elementKey;
  return link.category === 'cast' ? `${el.id}. ${el.name}` : (el.name || el.id);
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
 *  `linkedElements` report field. Crew targets are excluded (see
 *  `linkedCrewNamesForPerson`). */
export function linkedElementLabelsForPerson(project: Project, personId: string): string {
  return getCrewLinksForPerson(project.crewLinks, personId)
    .filter(l => l.category !== CREW_LINK_TARGET)
    .map(l => elementLabelForLink(project, l))
    .join(', ');
}

/** Resolved crew names a person is linked to (comma-separated) — the crew
 *  item's `linkedCrew` report field. */
export function linkedCrewNamesForPerson(project: Project, personId: string): string {
  const byId = crewNameMap(project);
  const names: string[] = [];
  for (const link of getCrewLinksForPerson(project.crewLinks, personId)) {
    if (link.category !== CREW_LINK_TARGET) continue;
    const name = byId.get(link.elementKey);
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(', ');
}

/** Resolved crew names linked to an element (comma-separated) — the
 *  `linkedCrew` report field. */
export function linkedCrewNamesForElement(project: Project, category: string, elementKey: string): string {
  const byId = crewNameMap(project);
  const names: string[] = [];
  for (const link of getCrewLinksForElement(project.crewLinks, category, elementKey)) {
    const name = byId.get(link.personId);
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(', ');
}

export interface CrewLinkWarning {
  personId: string;
  category: string;
  targetKey: string;
  /** 'crew' = the target is another person; 'element' = an element. */
  targetKind: 'crew' | 'element';
  targetLabel: string;
  message: string;
}

/**
 * Dangling-link warnings for ONE day (roadmap 11): a crew person who IS on the
 * day is linked to a target (another crew person or an element) that is NOT on
 * the day — the assignment has nothing to point at, so printing would lie.
 * `isElementOnDay` receives the `elementMatchId` key (cast = Board ID, others =
 * name, case-insensitive).
 */
export function crewLinkWarnings(params: {
  links: CrewLink[] | undefined;
  dayCrewIds: ReadonlySet<string>;
  crewName: (id: string) => string | undefined;
  targetLabel: (link: CrewLink) => string;
  isElementOnDay: (category: string, elementKey: string) => boolean;
}): CrewLinkWarning[] {
  const out: CrewLinkWarning[] = [];
  for (const link of params.links || []) {
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
