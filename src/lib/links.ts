import type { CrewLink, ElementLink, Link, LinkKind, Project } from '../types';
import { generateUUID } from './utils';

/**
 * Unified links (roadmap 308) — ONE store for element rules, crew attachments
 * and location links. `project.links` is canonical; the legacy `elementLinks`
 * and `crewLinks` shapes are converted on every load (idempotent) so older
 * files and older peers keep working.
 *
 * ONLY `element → element` links propagate into scenes (`isPropagationLink`).
 * Crew and location links are associations: reports, warnings, the Element
 * View panel and the day location suggestions read them, but scene fields
 * never change because of them.
 *
 * Leaf module: types + utils only (no store/element imports), so load-time
 * migrations can use it without a cycle.
 */

/** Reserved kind meaning "the target is another crew person". */
export const CREW_LINK_TARGET = 'crew';

/** Does this link participate in scene propagation? */
export function isPropagationLink(link: Link): boolean {
  return link.anchorKind === 'element' && link.linkedKind === 'element';
}

/** Element values: cast Board IDs are exact; every other category is a
 *  case-insensitive name. */
function elementValue(category: string | undefined, value: string): string {
  const v = String(value ?? '').trim();
  return category === 'cast' ? v : v.toLowerCase();
}

function sideKey(kind: LinkKind, category: string | undefined, value: string): string {
  if (kind === 'element') return `element\u0000${category || ''}\u0000${elementValue(category, value)}`;
  return `${kind}\u0000\u0000${String(value ?? '').trim()}`;
}

/** Exact-duplicate signature for one link (element names case-insensitive). */
export function linkSignature(link: Link): string {
  return `${sideKey(link.anchorKind, link.anchorCategory, link.anchorValue)}=>${sideKey(link.linkedKind, link.linkedCategory, link.linkedValue)}`;
}

/** Drops incomplete and exact-duplicate links (first wins). */
export function dedupeLinks(links: Link[]): Link[] {
  const seen = new Set<string>();
  const out: Link[] = [];
  for (const link of links) {
    if (!link.anchorValue || !link.linkedValue) continue;
    const key = linkSignature(link);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

/** True when two element values are the same in a category's matching space. */
export function elementValueMatches(category: string, a: string, b: string): boolean {
  return elementValue(category, a) === elementValue(category, b);
}

export function makeLink(
  anchorKind: LinkKind,
  anchorCategory: string | undefined,
  anchorValue: string,
  linkedKind: LinkKind,
  linkedCategory: string | undefined,
  linkedValue: string,
): Link {
  return { id: generateUUID(), anchorKind, anchorCategory, anchorValue, linkedKind, linkedCategory, linkedValue };
}

export function getOutgoingLinks(
  links: Link[] | undefined,
  anchorKind: LinkKind,
  anchorCategory: string | undefined,
  anchorValue: string,
): Link[] {
  if (!links || !anchorValue) return [];
  return links.filter(l =>
    l.anchorKind === anchorKind &&
    (anchorKind !== 'element' || (l.anchorCategory === anchorCategory && elementValueMatches(anchorCategory || '', l.anchorValue, anchorValue))),
  );
}

export function getIncomingLinks(
  links: Link[] | undefined,
  linkedKind: LinkKind,
  linkedCategory: string | undefined,
  linkedValue: string,
): Link[] {
  if (!links || !linkedValue) return [];
  return links.filter(l =>
    l.linkedKind === linkedKind &&
    (linkedKind !== 'element' || (l.linkedCategory === linkedCategory && elementValueMatches(linkedCategory || '', l.linkedValue, linkedValue))),
  );
}

/** Links owned by one element (any linked kind). */
export function getElementOutgoingLinks(links: Link[] | undefined, category: string, value: string, linkedKind?: LinkKind): Link[] {
  return getOutgoingLinks(links, 'element', category, value).filter(l => !linkedKind || l.linkedKind === linkedKind);
}

/** Links pointing at one element (any anchor kind). */
export function getElementIncomingLinks(links: Link[] | undefined, category: string, value: string, anchorKind?: LinkKind): Link[] {
  return getIncomingLinks(links, 'element', category, value).filter(l => !anchorKind || l.anchorKind === anchorKind);
}

/** Every link involving one crew person (either side). */
export function getCrewPersonLinks(links: Link[] | undefined, personId: string): Link[] {
  if (!links || !personId) return [];
  return links.filter(l =>
    (l.anchorKind === 'crew' && l.anchorValue === personId) ||
    (l.linkedKind === 'crew' && l.linkedValue === personId),
  );
}

/** The crew side of a link (the person it names), or ''. */
export function crewPersonIdOf(link: Link): string {
  if (link.anchorKind === 'crew') return link.anchorValue;
  if (link.linkedKind === 'crew') return link.linkedValue;
  return '';
}

/** The element side of a link, or null. */
export function elementSideOf(link: Link): { category: string; value: string } | null {
  if (link.anchorKind === 'element' && link.anchorCategory) return { category: link.anchorCategory, value: link.anchorValue };
  if (link.linkedKind === 'element' && link.linkedCategory) return { category: link.linkedCategory, value: link.linkedValue };
  return null;
}

/**
 * Roadmap 308 migration: convert legacy `elementLinks` + `crewLinks` into
 * `project.links` and drop the old fields from the in-memory project (they are
 * gone from the next save). Idempotent; late legacy records from an older peer
 * are merged and deduped on the next load.
 */
export function migrateProjectLinks(project: Project): boolean {
  const legacyElements: ElementLink[] = project.elementLinks || [];
  const legacyCrew: CrewLink[] = project.crewLinks || [];
  if (legacyElements.length === 0 && legacyCrew.length === 0) return false;

  const converted: Link[] = [];
  for (const l of legacyElements) {
    converted.push({
      id: l.id,
      anchorKind: 'element',
      anchorCategory: l.anchorCategory,
      anchorValue: l.anchorValue,
      linkedKind: 'element',
      linkedCategory: l.linkedCategory,
      linkedValue: l.linkedValue,
    });
  }
  for (const l of legacyCrew) {
    if (l.category === CREW_LINK_TARGET) {
      converted.push({
        id: l.id,
        anchorKind: 'crew',
        anchorValue: l.personId,
        linkedKind: 'crew',
        linkedValue: l.elementKey,
      });
    } else {
      converted.push({
        id: l.id,
        anchorKind: 'element',
        anchorCategory: l.category,
        anchorValue: l.elementKey,
        linkedKind: 'crew',
        linkedValue: l.personId,
      });
    }
  }

  project.links = dedupeLinks([...(project.links || []), ...converted]);
  delete project.elementLinks;
  delete project.crewLinks;
  return true;
}
