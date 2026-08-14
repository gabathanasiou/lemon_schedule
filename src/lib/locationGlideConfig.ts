import type { Item } from '@glideapps/glide-data-grid';
import type { Project, ProjectLocation } from '../types';
import { generateUUID } from './utils';
import type { PasteColumn, PasteRange } from './glidePaste';
import {
  buildCategoryPastePlan,
  type GlideRow,
  type GlideCategory,
  type GlidePastePlan,
  type GlideCsvImport,
  type GlideShellConfig,
} from './glideShell';
import { resolveTypeKey } from './locations';
import { parseLocationsCSV, commitLocationsImport, exportLocationsCSV, buildLocationRows, type LocationCsvImportResult } from './locationGlide';

const locationTypesOf = (project: Project): GlideCategory[] => (project.locationTypes || []).map(t => ({ key: t.key, label: t.label }));

/** Patches one location's field, or moves it to another type. */
function commitLocationEdit(dispatch: (action: any) => void, row: GlideRow, colKey: string, newVal: string, project: Project) {
  if (colKey === 'type') {
    const types = locationTypesOf(project);
    const key = resolveTypeKey(newVal, types);
    if (!key || key === row.categoryKey) return;
    if (!types.some(t => t.key === key)) {
      dispatch({ type: 'BATCH_START' });
      dispatch({ type: 'ADD_LOCATION_TYPE', payload: { type: { key, label: newVal.trim() } } });
      dispatch({ type: 'UPDATE_LOCATION', payload: { id: row.key, updates: { type: key } } });
      dispatch({ type: 'BATCH_COMMIT' });
    } else {
      dispatch({ type: 'UPDATE_LOCATION', payload: { id: row.key, updates: { type: key } } });
    }
    return;
  }
  const updates: Partial<ProjectLocation> = {};
  (updates as any)[colKey] = newVal;
  dispatch({ type: 'UPDATE_LOCATION', payload: { id: row.key, updates } });
}

/** Creates a new location from the add-row cell; type falls back to the first type. */
function createLocationFromAddRow(dispatch: (action: any) => void, colKey: string, val: string, project: Project) {
  const types = locationTypesOf(project);
  let typeKey: string | null = null;
  let newTypeLabel = '';
  if (colKey === 'type') {
    typeKey = resolveTypeKey(val, types);
    newTypeLabel = val.trim();
  } else {
    typeKey = types[0]?.key || null;
  }
  if (!typeKey) return;
  dispatch({ type: 'BATCH_START' });
  if (!types.some(t => t.key === typeKey)) {
    dispatch({ type: 'ADD_LOCATION_TYPE', payload: { type: { key: typeKey, label: newTypeLabel || typeKey } } });
  }
  const location: ProjectLocation = {
    id: generateUUID(),
    type: typeKey,
    name: colKey === 'name' ? val : '',
  };
  if (colKey === 'address') location.address = val;
  if (colKey === 'contactName') location.contactName = val;
  if (colKey === 'phone') location.phone = val;
  if (colKey === 'email') location.email = val;
  dispatch({ type: 'ADD_LOCATION', payload: { location } });
  dispatch({ type: 'BATCH_COMMIT' });
}

function planLocationPaste(
  target: Item,
  values: readonly (readonly string[])[],
  rows: GlideRow[],
  columns: PasteColumn[],
  selection: PasteRange | null | undefined,
  project: Project,
): GlidePastePlan {
  const types = locationTypesOf(project);
  return buildCategoryPastePlan(target, values, rows, columns, selection, raw => ({
    categoryKey: resolveTypeKey(raw.type || '', types),
    categoryLabel: (raw.type || '').trim(),
    values: { name: (raw.name || '').trim(), address: raw.address || '', contactName: raw.contactName || '', phone: raw.phone || '', email: raw.email || '' },
  }));
}

/** Commits a pasted plan in one batch: types are created, locations added, cells patched. */
function commitLocationPaste(dispatch: (action: any) => void, plan: GlidePastePlan, rows: GlideRow[], project: Project) {
  if (plan.editRows.length === 0 && plan.newRows.length === 0) return;
  const types = locationTypesOf(project);
  dispatch({ type: 'BATCH_START' });
  const newTypeKeys = new Set<string>();
  for (const nr of plan.newRows) {
    if (nr.categoryKey && !types.some(t => t.key === nr.categoryKey) && !newTypeKeys.has(nr.categoryKey)) {
      newTypeKeys.add(nr.categoryKey);
      dispatch({ type: 'ADD_LOCATION_TYPE', payload: { type: { key: nr.categoryKey, label: nr.categoryLabel || nr.categoryKey } } });
    }
  }
  for (const nr of plan.newRows) {
    if (!nr.categoryKey) continue;
    const location: ProjectLocation = {
      id: generateUUID(),
      name: nr.values.name,
      type: nr.categoryKey,
    };
    if (nr.values.address) location.address = nr.values.address;
    if (nr.values.contactName) location.contactName = nr.values.contactName;
    if (nr.values.phone) location.phone = nr.values.phone;
    if (nr.values.email) location.email = nr.values.email;
    dispatch({ type: 'ADD_LOCATION', payload: { location } });
  }
  for (const e of plan.editRows) {
    const r = rows[e.row];
    if (r) commitLocationEdit(dispatch, r, e.colKey, e.val, project);
  }
  dispatch({ type: 'BATCH_COMMIT' });
}

function deleteLocationRow(dispatch: (action: any) => void, row: GlideRow) {
  dispatch({ type: 'DELETE_LOCATION', payload: row.key });
}

export const locationGlideConfig: GlideShellConfig = {
  widthStorageKey: 'locations',
  columnDefs: [
    { key: 'actions', label: '', width: 36 },
    { key: 'name', label: 'Name', width: 200 },
    { key: 'type', label: 'Type', width: 140, kind: 'category', clearable: false, placeholder: 'Type' },
    { key: 'address', label: 'Address', width: 220 },
    { key: 'contactName', label: 'Contact', width: 140 },
    { key: 'phone', label: 'Phone', width: 120, align: 'right' },
    { key: 'email', label: 'Email', width: 200 },
  ],
  buildRows: buildLocationRows,
  categories: locationTypesOf,
  resolveCategoryKey: (text, categories) => resolveTypeKey(text, categories),
  commitEdit: commitLocationEdit,
  createFromAddRow: createLocationFromAddRow,
  planPaste: planLocationPaste,
  commitPaste: commitLocationPaste,
  deleteRow: deleteLocationRow,
  sortAction: (dispatch, key, direction) => dispatch({ type: 'SORT_LOCATIONS_BY', payload: { key, direction } }),
  async parseCSV(file, project) {
    const r = await parseLocationsCSV(file, project.locationTypes || []);
    return { ...r, count: r.rows.length, newCategories: r.newTypes };
  },
  commitImport(dispatch, result, project) {
    commitLocationsImport(dispatch, result as unknown as LocationCsvImportResult, project);
  },
  exportCSV: exportLocationsCSV,
  labels: {
    infoTitle: 'Locations',
    infoCounts(rows, project) {
      return [
        { label: 'Locations', count: rows.length },
        { label: 'Types', count: (project.locationTypes || []).length },
      ];
    },
    importTitle: 'Import Locations CSV',
    importNoun: 'locations',
    importSummary: 'Locations matching an existing type + name have their details updated (non-empty values only); everyone else is added.',
    exportNoun: 'Locations',
    goToManager: row => `Go to Locations Manager → ${row.categoryLabel}`,
  },
};
