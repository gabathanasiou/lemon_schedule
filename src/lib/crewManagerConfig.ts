import type { Project, CrewPerson } from '../types';
import { generateUUID } from './utils';
import {
  computeManagerDiff,
  type ManagerRow,
  type ManagerShellConfig,
  type ManagerSavePlan,
} from './managerShell';

function buildCrewRows(project: Project, role: string): ManagerRow[] {
  return (project.crew?.[role] || []).map(p => ({
    key: p.id,
    id: p.id,
    name: p.name,
    phone: p.phone || '',
    email: p.email || '',
  }));
}

function slugifyRole(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || generateUUID().slice(0, 8);
}

function commitCrewPlan(dispatch: (action: any) => void, plan: ManagerSavePlan, role: string, project: Project) {
  for (const id of plan.removes) dispatch({ type: 'DELETE_CREW_PERSON', payload: { role, id } });
  for (const row of plan.adds) {
    dispatch({
      type: 'ADD_CREW_PERSON',
      payload: {
        role,
        person: { id: row.id || generateUUID(), name: row.name || '', phone: row.phone || '', email: row.email || '' },
      },
    });
  }
  for (const u of plan.updates) dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role, id: u.id, updates: u.updates as Partial<CrewPerson> } });
}

export const crewManagerConfig: ManagerShellConfig = {
  title: 'Crew',
  nounSingular: 'member',
  nounPlural: 'members',
  addNoun: 'Member',
  categorySingular: 'role',
  categoryPlural: 'roles',
  sidebarTitle: 'Roles',
  addScopeLabel: 'Add Role',
  renameScopeLabel: 'Rename Role',
  mergeTitle: 'Merge Members',
  mergeIntro: 'The following crew members now share a name within this role. Saving will merge each set into a single member and combine their contact details.',
  mergeSummary: 'contacts combined',
  fields: [
    { key: 'name', label: 'Name', width: 'w-44' },
    { key: 'phone', label: 'Phone', width: 'w-36' },
    { key: 'email', label: 'Email', width: '' },
  ],
  mergeableFields: ['phone', 'email'],
  categories: project => project.crewRoles || [],
  addCategory(dispatch, label, categories) {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const key = slugifyRole(trimmed);
    if (categories.some(r => r.key === key)) return null;
    dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key, label: trimmed } } });
    return key;
  },
  renameCategory(dispatch, key, label) {
    dispatch({ type: 'RENAME_CREW_ROLE', payload: { key, label } });
  },
  deleteCategoryConfirm(category, peopleCount) {
    return {
      title: `Delete "${category.label}"?`,
      message: peopleCount > 0
        ? `This role has ${peopleCount} person${peopleCount !== 1 ? 's' : ''}. Removing it also removes them from the crew.`
        : 'This role will be removed from the catalog.',
      suppressKey: 'lemon_schedule_dnwa_delete_crew_role',
    };
  },
  deleteCategory(dispatch, key) {
    dispatch({ type: 'DELETE_CREW_ROLE', payload: key });
  },
  loadRows: buildCrewRows,
  makeBlankRow: () => ({ key: String(Date.now()), id: '', name: '', phone: '', email: '' }),
  commitPlan: commitCrewPlan,
  sortModes: [
    { key: 'name', label: 'By Name', comparator: (a, b) => (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase()) },
    { key: 'phone', label: 'By Phone', comparator: (a, b) => (a.phone || a.name).toLowerCase().localeCompare((b.phone || b.name).toLowerCase()) },
  ],
};

export { computeManagerDiff };
