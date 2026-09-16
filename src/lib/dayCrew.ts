import type { CrewPerson, CrewRole, DayCrewSlot, DayMeta, Project } from '../types';
import { CREW_DEPARTMENTS, crewRoleGroup } from './crewCatalog';
import { resolveCrewCall } from './callTimes';
import { generateUUID } from './utils';

/**
 * Item 146 — the ONE owner of per-day crew slots and the project crew template.
 *
 * A day's crew is a list of {@link DayCrewSlot}s grouped by department. A slot
 * is a role + an optional person + an optional call; the call travels with the
 * slot, so swapping the person keeps it. Days inherit the project template
 * (`crewTemplate.slots`), which itself derives from the roster (one slot per
 * role, first person) when unset — so a template always exists.
 *
 * Call chain: day call → department pre-call resolves against it = DEPT call →
 * slot override resolves against the dept call. `noCall` wins (blank box).
 * Nothing reads `daybreakMeta.crewSlots` / `crewTemplate.slots` raw — every
 * access goes through here.
 */

export const OTHER_DEPT = 'Other';

/** The department display order: catalog order, then custom departments (in
 *  role order), then "Other" last. */
export function departmentOrder(project: Project, extra: string[] = []): string[] {
  const out: string[] = CREW_DEPARTMENTS.map(d => d.name);
  const add = (name: string) => {
    if (name && name !== OTHER_DEPT && !out.includes(name)) out.push(name);
  };
  for (const role of project.crewRoles || []) add(crewRoleGroup(role));
  for (const name of extra) add(name);
  out.push(OTHER_DEPT);
  return out;
}

/** The department a role belongs to (catalog, the role's own group, else
 *  "Other"). */
export function departmentOfRole(project: Project, roleKey: string): string {
  const role = (project.crewRoles || []).find(r => r.key === roleKey);
  return role ? crewRoleGroup(role) : OTHER_DEPT;
}

export interface CrewPersonRef {
  roleKey: string;
  person: CrewPerson;
}

/** Person id → { roleKey, person } for every roster member. */
export function crewPeopleById(project: Project): Map<string, CrewPersonRef> {
  const map = new Map<string, CrewPersonRef>();
  for (const role of project.crewRoles || []) {
    for (const person of project.crew?.[role.key] || []) map.set(person.id, { roleKey: role.key, person });
  }
  return map;
}

/** The people of one role, in roster order. */
export function peopleForRole(project: Project, roleKey: string): CrewPerson[] {
  return project.crew?.[roleKey] || [];
}

/** The roles in a department (the "Add role" choices). Duplicates are
 *  intentional — a role can hold several slots. */
export function rolesForDept(project: Project, dept: string): CrewRole[] {
  return (project.crewRoles || []).filter(r => crewRoleGroup(r) === dept);
}

/** The derived baseline: one slot per role that has people, first person. */
export function buildDefaultSlots(project: Project): DayCrewSlot[] {
  const out: DayCrewSlot[] = [];
  for (const role of project.crewRoles || []) {
    const people = peopleForRole(project, role.key);
    if (people.length === 0) continue;
    out.push({ id: generateUUID(), role: role.key, personId: people[0].id });
  }
  return out;
}

/** Slots materialized from a legacy person-id list (+ optional legacy calls). */
function slotsFromPersonIds(project: Project, ids: string[], crewCalls?: DayMeta['crewCalls']): DayCrewSlot[] {
  const byId = crewPeopleById(project);
  const callById = new Map((crewCalls || []).map(c => [c.personId, c.callTime]));
  const out: DayCrewSlot[] = [];
  for (const pid of ids) {
    const entry = byId.get(pid);
    if (!entry) continue;
    const call = callById.get(pid);
    out.push({ id: generateUUID(), role: entry.roleKey, personId: pid, ...(call ? { callTime: call } : {}) });
  }
  return out;
}

/** Legacy `crewIds` / `crewCalls` → slots; undefined when the day carried no
 *  explicit crew (it then derives from the template/default). */
function legacySlots(project: Project, meta: DayMeta): DayCrewSlot[] | undefined {
  const explicit = meta.crewIds && meta.crewIds.length > 0 ? meta.crewIds : null;
  const calls = meta.crewCalls && meta.crewCalls.length > 0 ? meta.crewCalls : null;
  if (!explicit && !calls) return undefined;
  const ids = explicit ?? [...crewPeopleById(project).keys()];
  const slots = slotsFromPersonIds(project, ids, meta.crewCalls);
  return slots.length > 0 ? slots : undefined;
}

/** The project template's slots, or undefined when it should derive. Legacy
 *  `crewTemplate.crewIds` is honored until migrated. */
export function templateSlots(project: Project): DayCrewSlot[] | undefined {
  const template = project.crewTemplate;
  if (template?.slots && template.slots.length > 0) return template.slots;
  if (template?.crewIds && template.crewIds.length > 0) {
    const slots = slotsFromPersonIds(project, template.crewIds);
    return slots.length > 0 ? slots : undefined;
  }
  return undefined;
}

/** The day's effective slots: its own → legacy → the template → derived. */
export function slotsForDay(project: Project, meta: DayMeta): DayCrewSlot[] {
  if (meta.crewSlots) return meta.crewSlots;
  const legacy = legacySlots(project, meta);
  if (legacy) return legacy;
  return templateSlots(project) ?? buildDefaultSlots(project);
}

/** Departments excluded for the day (day override → template → none). */
export function excludedDeptsForDay(project: Project, meta: DayMeta): string[] {
  if (meta.excludedCrewDepts) return meta.excludedCrewDepts;
  return project.crewTemplate?.excludedCrewDepts ?? [];
}

/** The effective department pre-call expression (day override → template). */
export function deptPrecallExpr(project: Project, meta: DayMeta, dept: string): string {
  return meta.departmentPrecalls?.[dept] ?? project.crewTemplate?.departmentPrecalls?.[dept] ?? '';
}

/** The resolved call for one slot: noCall → blank; else the override anchored
 *  on the department call; else the department call itself. */
export function resolveSlotCall(slot: DayCrewSlot, precall: string, dayCall: string): string {
  if (slot.noCall) return '';
  return resolveCrewCall(slot.callTime, precall, dayCall);
}

export interface DayCrewGroup {
  dept: string;
  slots: DayCrewSlot[];
  excluded: boolean;
  /** Effective pre-call expression ('' = none). */
  precall: string;
  /** The department call, resolved against the day call. */
  deptCall: string;
}

/** Groups a slot list into department blocks in display order. Slots inside a
 *  department follow the project role order (stable for ties). */
export function groupSlotsByDept(
  project: Project,
  meta: DayMeta,
  slots: DayCrewSlot[],
  dayCall: string,
): DayCrewGroup[] {
  const excluded = new Set(excludedDeptsForDay(project, meta));
  const byDept = new Map<string, DayCrewSlot[]>();
  for (const slot of slots) {
    const dept = departmentOfRole(project, slot.role);
    const list = byDept.get(dept);
    if (list) list.push(slot);
    else byDept.set(dept, [slot]);
  }
  const roleIndex = new Map((project.crewRoles || []).map((r, i) => [r.key, i]));
  const order = departmentOrder(project, [...byDept.keys()]);
  const out: DayCrewGroup[] = [];
  for (const dept of order) {
    const deptSlots = byDept.get(dept);
    if (!deptSlots || deptSlots.length === 0) continue;
    const precall = deptPrecallExpr(project, meta, dept);
    out.push({
      dept,
      slots: [...deptSlots].sort((a, b) => (roleIndex.get(a.role) ?? 999) - (roleIndex.get(b.role) ?? 999)),
      excluded: excluded.has(dept),
      precall,
      deptCall: resolveCrewCall(null, precall, dayCall),
    });
  }
  return out;
}

// ---- pure mutations (immutable; callers store via UPDATE_ROW / UPDATE_PROJECT) --

export function addSlot(slots: DayCrewSlot[], role: string, personId?: string): DayCrewSlot[] {
  return [...slots, { id: generateUUID(), role, ...(personId ? { personId } : {}) }];
}

export function removeSlot(slots: DayCrewSlot[], id: string): DayCrewSlot[] {
  return slots.filter(s => s.id !== id);
}

export function assignSlotPerson(slots: DayCrewSlot[], id: string, personId: string | undefined): DayCrewSlot[] {
  return slots.map(s => (s.id === id ? { ...s, personId: personId || undefined } : s));
}

/** Sets / clears a slot's call override. A non-blank value clears `noCall`. */
export function setSlotCall(slots: DayCrewSlot[], id: string, raw: string): DayCrewSlot[] {
  const value = raw.trim();
  return slots.map(s => {
    if (s.id !== id) return s;
    const next = { ...s };
    delete next.noCall;
    if (value) next.callTime = value;
    else delete next.callTime;
    return next;
  });
}

/** Marks a slot explicitly call-less (clears any stored override). */
export function setSlotNoCall(slots: DayCrewSlot[], id: string, noCall: boolean): DayCrewSlot[] {
  return slots.map(s => {
    if (s.id !== id) return s;
    const next = { ...s };
    delete next.callTime;
    if (noCall) next.noCall = true;
    else delete next.noCall;
    return next;
  });
}
