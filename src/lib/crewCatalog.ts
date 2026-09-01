import { CrewRole } from '../types';

// ---- official crew catalog ---------------------------------------------------
//
// The industry-standard hierarchy: ABOVE THE LINE first (producers, director),
// then BELOW THE LINE grouped by department in standard call-sheet order. This
// is the canonical ordering for new projects and the LOAD reorder of existing
// projects; custom roles (no catalog entry) keep their stored order and render
// at the end, outside any department section.

export interface CrewDepartment {
  name: string;
  roles: CrewRole[];
}

export const CREW_DEPARTMENTS: CrewDepartment[] = [
  {
    name: 'Above the Line',
    roles: [
      { key: 'producer', label: 'Producer', builtin: true },
      { key: 'lineProducer', label: 'Line Producer', builtin: true },
      { key: 'director', label: 'Director', builtin: true },
    ],
  },
  {
    name: 'Production',
    roles: [
      { key: 'upm', label: 'Unit Production Manager', builtin: true },
      { key: 'firstAD', label: '1st AD', builtin: true },
      { key: 'secondAD', label: '2nd AD', builtin: true },
      { key: 'productionManager', label: 'Production Manager', builtin: true },
      { key: 'productionCoordinator', label: 'Production Coordinator', builtin: true },
      { key: 'scriptSupervisor', label: 'Script Supervisor', builtin: true },
      { key: 'productionAccountant', label: 'Production Accountant', builtin: true },
      { key: 'pa', label: 'PA', builtin: true },
    ],
  },
  {
    name: 'Camera',
    roles: [
      { key: 'dop', label: 'Director of Photography', builtin: true },
      { key: 'cameraOperator', label: 'Camera Operator', builtin: true },
      { key: 'firstAC', label: '1st AC', builtin: true },
      { key: 'secondAC', label: '2nd AC', builtin: true },
      { key: 'dit', label: 'DIT', builtin: true },
    ],
  },
  {
    name: 'Sound',
    roles: [
      { key: 'soundMixer', label: 'Sound Mixer', builtin: true },
      { key: 'boomOp', label: 'Boom Operator', builtin: true },
    ],
  },
  {
    name: 'Art',
    roles: [
      { key: 'productionDesigner', label: 'Production Designer', builtin: true },
      { key: 'artDirector', label: 'Art Director', builtin: true },
      { key: 'setDecorator', label: 'Set Decorator', builtin: true },
    ],
  },
  {
    name: 'Wardrobe',
    roles: [
      { key: 'costumeDesigner', label: 'Costume Designer', builtin: true },
    ],
  },
  {
    name: 'Makeup & Hair',
    roles: [
      { key: 'makeup', label: 'Makeup', builtin: true },
      { key: 'hair', label: 'Hair', builtin: true },
    ],
  },
  {
    name: 'Grip & Electric',
    roles: [
      { key: 'keyGrip', label: 'Key Grip', builtin: true },
      { key: 'dollyGrip', label: 'Dolly Grip', builtin: true },
      { key: 'gaffer', label: 'Gaffer', builtin: true },
    ],
  },
  {
    name: 'Locations',
    roles: [
      { key: 'locations', label: 'Locations', builtin: true },
    ],
  },
  {
    name: 'Stunts & Special Effects',
    roles: [
      { key: 'stunts', label: 'Stunts', builtin: true },
      { key: 'specialEffects', label: 'Special Effects', builtin: true },
    ],
  },
  {
    name: 'Casting',
    roles: [
      { key: 'castingDirector', label: 'Casting Director', builtin: true },
    ],
  },
  {
    name: 'Post Production',
    roles: [
      { key: 'editor', label: 'Editor', builtin: true },
      { key: 'vfxSupervisor', label: 'VFX Supervisor', builtin: true },
    ],
  },
];

export const DEFAULT_CREW_ROLES: CrewRole[] = CREW_DEPARTMENTS.flatMap(d => d.roles);

export const CREW_BUILTIN_KEYS = new Set(DEFAULT_CREW_ROLES.map(r => r.key));

/** The department section a built-in role belongs to, or undefined for customs. */
export function crewDepartmentOf(key: string): string | undefined {
  for (const d of CREW_DEPARTMENTS) {
    if (d.roles.some(r => r.key === key)) return d.name;
  }
  return undefined;
}

/** The sidebar section a role renders under: built-ins map to their catalog
 *  department; custom roles use their assigned `department`, falling back to
 *  the "Other" divider when unassigned. */
export function crewRoleGroup(role: CrewRole): string {
  const catalog = crewDepartmentOf(role.key);
  if (catalog) return catalog;
  return role.department || 'Other';
}

/** The department picker options when adding a custom role. */
export const CREW_DEPARTMENT_NAMES: string[] = CREW_DEPARTMENTS.map(d => d.name);

/** Reorders roles to the official catalog (built-ins per department order,
 *  customs appended in stored order). */
export function reorderCrewRoles(roles: CrewRole[]): CrewRole[] {
  const byKey = new Map(roles.map(r => [r.key, r]));
  const builtins: CrewRole[] = [];
  for (const d of CREW_DEPARTMENTS) {
    for (const def of d.roles) {
      const stored = byKey.get(def.key);
      builtins.push(stored ? { ...stored, label: stored.label || def.label } : { ...def });
    }
  }
  const customs = roles.filter(r => !CREW_BUILTIN_KEYS.has(r.key));
  return [...builtins, ...customs];
}
