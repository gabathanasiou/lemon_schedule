import type { Project } from '../types';
import { getFieldItems } from './categories';
import { crewRoleGroup } from './crewCatalog';
import { resolvedLocationName, typeLabelOf } from './locations';

/**
 * Picker catalogs for the non-element link targets (roadmap 308): crew people
 * grouped by department (role as the right-aligned hint) and locations grouped
 * by type. The SAME catalogs feed the Element View Links tab and the Link
 * Manager, so crew and locations behave like the Day Manager's grouped
 * pickers — names, never raw ids.
 *
 * Crew rows also offer an "All <department>" TAG. It is a STORED department
 * link (`linkedKind: 'department'`, value = department name), not a snapshot:
 * people added to that department later are covered automatically. The tag is
 * picker-only encoded in the draft row as `dept:<name>` and converted by
 * `linkDrafts`.
 */

export interface LinkTargetItem {
  id: string;
  name: string;
  group?: string;
  hint?: string;
  /** Render as a highlighted tag (the "All <department>" rows). */
  tag?: boolean;
}

const DEPT_PREFIX = 'dept:';

export const crewDeptTargetId = (dept: string): string => `${DEPT_PREFIX}${dept}`;
export const isCrewDeptTargetId = (id: string): boolean => id.startsWith(DEPT_PREFIX);
export const crewDeptOfTargetId = (id: string): string => id.slice(DEPT_PREFIX.length);

/** Every person id in one department (all roles of that department). */
export function crewIdsForDepartment(project: Project, dept: string): string[] {
  const out: string[] = [];
  for (const role of project.crewRoles || []) {
    if (crewRoleGroup(role) !== dept) continue;
    for (const person of project.crew?.[role.key] || []) out.push(person.id);
  }
  return out;
}

/** Crew picker rows: people by department plus one "All <dept>" tag per
 *  department. The tag sits above the department's people. */
export function crewTargetItems(project: Project): LinkTargetItem[] {
  const people: LinkTargetItem[] = [];
  const seenDept = new Set<string>();
  for (const role of project.crewRoles || []) {
    const dept = crewRoleGroup(role);
    if (!seenDept.has(dept)) {
      seenDept.add(dept);
      // Always offered — even for an empty department: the tag is the promise
      // that future joiners are covered.
      people.push({ id: crewDeptTargetId(dept), name: `All ${dept}`, group: dept, tag: true });
    }
    for (const person of project.crew?.[role.key] || []) {
      people.push({ id: person.id, name: person.name || '(unnamed)', group: dept, hint: role.label });
    }
  }
  return people;
}

/** Real locations for the picker, grouped by their location type. */
export function locationTargetItems(project: Project): LinkTargetItem[] {
  const types = project.locationTypes || [];
  return (project.locations || []).map(location => ({
    id: location.id,
    name: resolvedLocationName(location.name, location.address, location.place, location.lat, location.lng),
    group: typeLabelOf(location, types),
    hint: location.address && location.address !== location.name ? location.address : undefined,
  }));
}

/** Selected ids for the crew picker (person ids + `dept:` tag tokens). */
export function crewPickerIds(value: string): string[] {
  return getFieldItems('crew', value);
}
