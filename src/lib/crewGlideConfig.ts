import type { Item } from '@glideapps/glide-data-grid';
import type { Project, CrewPerson } from '../types';
import { generateUUID } from './utils';
import { planGridPaste, type PasteColumn, type PasteRange } from './glidePaste';
import {
  buildCategoryPastePlan,
  type GlideRow,
  type GlideCategory,
  type GlidePastePlan,
  type GlideCsvImport,
  type GlideShellConfig,
} from './glideShell';
import { resolveRoleKey, parseCrewCSV, commitCrewImport, exportCrewCSV, type CrewCsvImportResult } from './crewGlide';
import { resolveRoleCategories } from './crewCatalog';
import { ELEMENT_CATEGORIES, getLabel } from './categories';

/** Flattens the crew store into generic glide rows in FLAT display order
 *  (`project.crewOrder` — insertion order by default, manual sorts rewrite it).
 *  Rows are NOT grouped by role: editing a role keeps the row in place, and a
 *  new member typed at the bottom stays at the bottom. */
function buildCrewRows(project: Project): GlideRow[] {
  const byId = new Map<string, { roleKey: string; person: CrewPerson }>();
  for (const r of project.crewRoles || []) {
    for (const p of project.crew?.[r.key] || []) byId.set(p.id, { roleKey: r.key, person: p });
  }
  const order = project.crewOrder && project.crewOrder.length > 0 ? project.crewOrder : [...byId.keys()];
  const roleByKey = new Map((project.crewRoles || []).map(r => [r.key, r]));
  const catLabel = new Map<string, string>([
    ...ELEMENT_CATEGORIES.map(c => [c.key, getLabel(c.key, c.label, project.categoryLabels)] as [string, string]),
    ...(project.customCategories || []).map(c => [c.key, c.label] as [string, string]),
  ]);
  const rows: GlideRow[] = [];
  for (const id of order) {
    const e = byId.get(id);
    if (!e) continue;
    const role = roleByKey.get(e.roleKey);
    const label = role?.label || e.roleKey;
    rows.push({
      key: e.person.id,
      categoryKey: e.roleKey,
      categoryLabel: label,
      role: label,
      categories: resolveRoleCategories(role || { key: e.roleKey, label }).map(k => catLabel.get(k) || k).join(', '),
      name: e.person.name,
      phone: e.person.phone || '',
      email: e.person.email || '',
    });
  }
  return rows;
}

const crewCategories = (project: Project): GlideCategory[] => (project.crewRoles || []).map(r => ({ key: r.key, label: r.label }));

/** Patches one crew person's field, or moves them to another role. */
function commitCrewEdit(dispatch: (action: any) => void, row: GlideRow, colKey: string, newVal: string, project: Project) {
  if (colKey === 'role') {
    const categories = crewCategories(project);
    const key = resolveRoleKey(newVal, categories);
    if (!key || key === row.categoryKey) return;
    if (!categories.some(c => c.key === key)) {
      dispatch({ type: 'BATCH_START' });
      dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key, label: newVal.trim() } } });
      dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: row.categoryKey, id: row.key, updates: {}, toRole: key } });
      dispatch({ type: 'BATCH_COMMIT' });
    } else {
      dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: row.categoryKey, id: row.key, updates: {}, toRole: key } });
    }
    return;
  }
  if (colKey === 'categories') {
    const byLabel = new Map<string, string>();
    for (const c of ELEMENT_CATEGORIES) byLabel.set(getLabel(c.key, c.label, project.categoryLabels).toLowerCase(), c.key);
    for (const c of project.customCategories || []) byLabel.set(c.label.toLowerCase(), c.key);
    const keys: string[] = [];
    for (const part of newVal.split(',').map(x => x.trim()).filter(Boolean)) {
      const key = byLabel.get(part.toLowerCase())
        || (ELEMENT_CATEGORIES.some(c => c.key === part) || (project.customCategories || []).some(c => c.key === part) ? part : null);
      if (key && !keys.includes(key)) keys.push(key);
    }
    dispatch({ type: 'SET_CREW_ROLE_CATEGORIES', payload: { key: row.categoryKey, categories: keys } });
    return;
  }
  dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: row.categoryKey, id: row.key, updates: { [colKey]: newVal } } });
}

/** Creates a new crew person from the add-row cell; role falls back to the first role. */
function createCrewFromAddRow(dispatch: (action: any) => void, colKey: string, val: string, project: Project) {
  if (colKey === 'categories') return;
  const categories = crewCategories(project);
  let roleKey: string | null = null;
  let newRoleLabel = '';
  if (colKey === 'role') {
    roleKey = resolveRoleKey(val, categories);
    newRoleLabel = val.trim();
  } else {
    roleKey = categories[0]?.key || null;
  }
  if (!roleKey) return;
  dispatch({ type: 'BATCH_START' });
  if (!categories.some(c => c.key === roleKey)) {
    dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key: roleKey, label: newRoleLabel || roleKey } } });
  }
  dispatch({
    type: 'ADD_CREW_PERSON',
    payload: {
      role: roleKey,
      person: {
        id: generateUUID(),
        name: colKey === 'name' ? val : '',
        phone: colKey === 'phone' ? val : '',
        email: colKey === 'email' ? val : '',
      },
    },
  });
  dispatch({ type: 'BATCH_COMMIT' });
}

function planCrewPaste(
  target: Item,
  values: readonly (readonly string[])[],
  rows: GlideRow[],
  columns: PasteColumn[],
  selection: PasteRange | null | undefined,
  project: Project,
): GlidePastePlan {
  const categories = crewCategories(project);
  return buildCategoryPastePlan(target, values, rows, columns, selection, raw => ({
    categoryKey: resolveRoleKey(raw.role || '', categories),
    categoryLabel: (raw.role || '').trim(),
    values: { name: (raw.name || '').trim(), phone: raw.phone || '', email: raw.email || '' },
  }));
}

/** Commits a pasted plan in one batch: roles are created, new members added, cells patched. */
function commitCrewPaste(dispatch: (action: any) => void, plan: GlidePastePlan, rows: GlideRow[], project: Project) {
  if (plan.editRows.length === 0 && plan.newRows.length === 0) return;
  const categories = crewCategories(project);
  dispatch({ type: 'BATCH_START' });
  const newRoleKeys = new Set<string>();
  for (const nr of plan.newRows) {
    if (nr.categoryKey && !categories.some(c => c.key === nr.categoryKey) && !newRoleKeys.has(nr.categoryKey)) {
      newRoleKeys.add(nr.categoryKey);
      dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key: nr.categoryKey, label: nr.categoryLabel || nr.categoryKey } } });
    }
  }
  for (const nr of plan.newRows) {
    if (!nr.categoryKey) continue;
    dispatch({
      type: 'ADD_CREW_PERSON',
      payload: { role: nr.categoryKey, person: { id: generateUUID(), name: nr.values.name, phone: nr.values.phone, email: nr.values.email } },
    });
  }
  for (const e of plan.editRows) {
    const r = rows[e.row];
    if (r) commitCrewEdit(dispatch, r, e.colKey, e.val, project);
  }
  dispatch({ type: 'BATCH_COMMIT' });
}

function deleteCrewRow(dispatch: (action: any) => void, row: GlideRow) {
  dispatch({ type: 'DELETE_CREW_PERSON', payload: { role: row.categoryKey, id: row.key } });
}

export const crewGlideConfig: GlideShellConfig = {
  widthStorageKey: 'crew',
  columnDefs: [
    { key: 'actions', label: '', width: 36 },
    { key: 'name', label: 'Name', width: 200 },
    { key: 'role', label: 'Role', width: 160, kind: 'category', clearable: false, placeholder: 'Role' },
    { key: 'categories', label: 'Element Categories', width: 220, placeholder: 'Category, Category' },
    { key: 'phone', label: 'Phone', width: 130, align: 'right' },
    { key: 'email', label: 'Email', width: 220 },
  ],
  buildRows: buildCrewRows,
  categories: crewCategories,
  resolveCategoryKey: (text, categories) => resolveRoleKey(text, categories),
  commitEdit: commitCrewEdit,
  createFromAddRow: createCrewFromAddRow,
  planPaste: planCrewPaste,
  commitPaste: commitCrewPaste,
  deleteRow: deleteCrewRow,
  sortAction: (dispatch, key, direction) => dispatch({ type: 'SORT_CREW_BY', payload: { key, direction } }),
  async parseCSV(file, project) {
    const r = await parseCrewCSV(file, project.crewRoles || []);
    return { ...r, count: r.people.length, newCategories: r.newRoles };
  },
  commitImport(dispatch, result, project) {
    commitCrewImport(dispatch, result as unknown as CrewCsvImportResult, project.crewRoles || [], project.crew || {});
  },
  exportCSV: exportCrewCSV,
  labels: {
    infoTitle: 'Members',
    infoCounts(rows, project) {
      return [
        { label: 'Members', count: rows.length },
        { label: 'Roles', count: (project.crewRoles || []).length },
      ];
    },
    importTitle: 'Import Crew CSV',
    importNoun: 'crew members',
    importSummary: 'Members matching an existing role + name have their phone/email updated (non-empty values only); everyone else is added.',
    exportNoun: 'Crew',
    goToManager: row => `Go to Crew Manager → ${row.categoryLabel}`,
  },
};
