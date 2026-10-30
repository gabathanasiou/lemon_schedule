import type { Project, CrewPerson, CrewRole } from '../types';
import { generateUUID } from './utils';
import { crewRoleGroup, CREW_DEPARTMENT_NAMES } from './crewCatalog';
import { CrewLinksButton } from '../components/crew/CrewLinksButton';
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
    // Phase 3 overtime pay basis (dollars at the field, cents at the boundary).
    rate: p.rateCents != null ? (p.rateCents / 100).toFixed(2) : '',
    rateUnit: p.rateUnit || '',
    guarantee: p.guaranteeHours != null ? String(p.guaranteeHours) : '',
  }));
}

/** Manager text columns → the person's numeric pay basis (cents). */
function payPatch(src: Record<string, string>): Partial<CrewPerson> {
  const out: Partial<CrewPerson> = {};
  // The destructured update always carries the keys (possibly undefined) —
  // never call string methods before proving the field is present.
  if (typeof src.rate === 'string') {
    const n = Number(src.rate.replace(/[^0-9.\-]/g, ''));
    out.rateCents = Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
  }
  if (typeof src.rateUnit === 'string') {
    const unit = src.rateUnit.trim().toLowerCase();
    out.rateUnit = unit === 'hour' || unit === 'day' || unit === 'flat' ? unit : undefined;
  }
  if (typeof src.guarantee === 'string') {
    const n = Number(src.guarantee.replace(/[^0-9.\-]/g, ''));
    out.guaranteeHours = Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return out;
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
        person: {
          id: row.id || generateUUID(), name: row.name || '', phone: row.phone || '', email: row.email || '',
          ...payPatch(row),
        },
      },
    });
  }
  for (const u of plan.updates) {
    const { rate, rateUnit, guarantee, ...rest } = u.updates as Record<string, string>;
    dispatch({
      type: 'UPDATE_CREW_PERSON',
      payload: { role, id: u.id, updates: { ...rest, ...payPatch({ rate, rateUnit, guarantee }) } as Partial<CrewPerson> },
    });
  }
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
  mergeIntro: 'The following crew members now share a name within this role. Merging collapses each set into a single member and combines their contact details.',
  mergeSummary: 'contacts combined',
  fields: [
    { key: 'name', label: 'Name', width: 'min-w-44 max-w-56', uppercase: true },
    { key: 'phone', label: 'Phone', width: 'min-w-36' },
    { key: 'email', label: 'Email', width: 'min-w-[140px]' },
    { key: 'rate', label: 'Rate', width: 'min-w-20' },
    { key: 'rateUnit', label: 'Per', width: 'min-w-16' },
    { key: 'guarantee', label: 'Guarantee', width: 'min-w-20' },
  ],
  mergeableFields: ['phone', 'email', 'rate', 'rateUnit', 'guarantee'],
  categories: project => project.crewRoles || [],
  categoryGroup: role => crewRoleGroup(role),
  categoryGroupOptions: CREW_DEPARTMENT_NAMES,
  addCategory(dispatch, label, categories, department) {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const key = slugifyRole(trimmed);
    if (categories.some(r => r.key === key)) return null;
    const role: CrewRole = { key, label: trimmed };
    // "Other" (the fallback) isn't stored — missing department groups there.
    if (department && department !== 'Other') role.department = department;
    dispatch({ type: 'ADD_CREW_ROLE', payload: { role } });
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
  makeBlankRow: () => ({ key: String(Date.now()), id: '', name: '', phone: '', email: '', rate: '', rateUnit: '', guarantee: '' }),
  commitPlan: commitCrewPlan,
  sortModes: [
    { key: 'name', label: 'By Name', comparator: (a, b) => (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase()) },
    { key: 'phone', label: 'By Phone', comparator: (a, b) => (a.phone || a.name).toLowerCase().localeCompare((b.phone || b.name).toLowerCase()) },
  ],
  renderHeaderActions: ({ readOnly }) => <CrewLinksButton readOnly={readOnly} />,
};

export { computeManagerDiff };
