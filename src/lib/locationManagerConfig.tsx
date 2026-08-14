import React, { useState } from 'react';
import type { Project, ProjectLocation } from '../types';
import { generateUUID } from './utils';
import { resolveTypeKey, typeLabelOf } from './locations';
import { LocationPickerModal } from '../components/location/LocationPickerModal';
import {
  computeManagerDiff,
  type ManagerRow,
  type ManagerShellConfig,
  type ManagerSavePlan,
} from './managerShell';

const numOrUndef = (v: string | undefined): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function buildLocationRows(project: Project, type: string): ManagerRow[] {
  return (project.locations || []).filter(l => l.type === type).map(l => ({
    key: l.id,
    id: l.id,
    name: l.name,
    address: l.address || '',
    place: l.place || '',
    lat: l.lat != null ? String(l.lat) : '',
    lng: l.lng != null ? String(l.lng) : '',
    contactName: l.contactName || '',
    phone: l.phone || '',
    email: l.email || '',
    notes: l.notes || '',
    nearbyHospital: l.nearby?.hospitalId || '',
    nearbyPolice: l.nearby?.policeId || '',
  }));
}

function toLocation(row: ManagerRow, type: string): ProjectLocation {
  return {
    id: row.id || generateUUID(),
    name: row.name || '',
    type,
    address: row.address || undefined,
    place: row.place || undefined,
    lat: numOrUndef(row.lat),
    lng: numOrUndef(row.lng),
    contactName: row.contactName || undefined,
    phone: row.phone || undefined,
    email: row.email || undefined,
    notes: row.notes || undefined,
    nearby: {
      hospitalId: row.nearbyHospital || undefined,
      policeId: row.nearbyPolice || undefined,
    },
  };
}

function commitLocationPlan(dispatch: (action: any) => void, plan: ManagerSavePlan, type: string, project: Project) {
  for (const id of plan.removes) dispatch({ type: 'DELETE_LOCATION', payload: id });
  for (const row of plan.adds) dispatch({ type: 'ADD_LOCATION', payload: { location: toLocation(row, type) } });
  for (const u of plan.updates) {
    const existing = (project.locations || []).find(l => l.id === u.id);
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(u.updates)) {
      if (k === 'nearbyHospital' || k === 'nearbyPolice') continue;
      if (k === 'lat' || k === 'lng') {
        patch[k] = numOrUndef(v);
      } else if (v === '') {
        patch[k] = undefined;
      } else {
        patch[k] = v;
      }
    }
    if ('nearbyHospital' in u.updates || 'nearbyPolice' in u.updates) {
      patch.nearby = {
        hospitalId: 'nearbyHospital' in u.updates ? (u.updates.nearbyHospital || undefined) : existing?.nearby?.hospitalId,
        policeId: 'nearbyPolice' in u.updates ? (u.updates.nearbyPolice || undefined) : existing?.nearby?.policeId,
      };
    }
    dispatch({ type: 'UPDATE_LOCATION', payload: { id: u.id, updates: patch } });
  }
}

/** An address cell: opens the shared location modal; buffered through flat row fields. */
const AddressCell: React.FC<{ row: ManagerRow; update: (f: string, v: string) => void; readOnly: boolean }> = ({ row, update, readOnly }) => {
  const [open, setOpen] = useState(false);
  const hasPin = row.lat !== '' && row.lng !== '';
  const label = row.address || row.place || (hasPin ? `${row.lat}, ${row.lng}` : 'Set address…');
  const apply = (loc: { lat: number; lng: number; place?: string; address?: string }) => {
    update('lat', String(loc.lat));
    update('lng', String(loc.lng));
    update('place', loc.place || '');
    update('address', loc.address || '');
  };
  return (
    <>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setOpen(true)}
        title="Set address"
        className="w-full text-left bg-white border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-700 hover:border-zinc-400 transition-colors disabled:opacity-40"
      >
        {label}
      </button>
      <LocationPickerModal open={open} onClose={() => setOpen(false)} onConfirm={loc => { apply(loc); setOpen(false); }} />
    </>
  );
};

const addressField = (row: ManagerRow, update: (f: string, v: string) => void, readOnly: boolean) => (
  <AddressCell row={row} update={update} readOnly={readOnly} />
);

/** A "nearest facility" dropdown: picks another location row of the given type. */
const nearbyField = (kind: 'hospital' | 'police') => (row: ManagerRow, update: (f: string, v: string) => void, readOnly: boolean, ctx: { project: Project }) => {
  const typeKey = kind === 'hospital' ? 'hospital' : 'policeStation';
  const key = kind === 'hospital' ? 'nearbyHospital' : 'nearbyPolice';
  const options = (ctx.project.locations || []).filter(l => l.type === typeKey && l.id !== row.key);
  const current = row[key] || '';
  const currentLabel = current
    ? ((ctx.project.locations || []).find(l => l.id === current)?.name ?? '')
    : '';
  return (
    <select
      value={current}
      disabled={readOnly}
      onChange={e => update(key, e.target.value)}
      className="w-full bg-white border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-800 outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
    >
      <option value="">—</option>
      {options.map(l => (
        <option key={l.id} value={l.id}>{l.name}</option>
      ))}
      {current && !options.some(l => l.id === current) && (
        <option value={current}>{currentLabel || '…'}</option>
      )}
    </select>
  );
};

export const locationManagerConfig: ManagerShellConfig = {
  title: 'Locations',
  nounSingular: 'location',
  nounPlural: 'locations',
  addNoun: 'Location',
  categorySingular: 'type',
  categoryPlural: 'types',
  sidebarTitle: 'Types',
  addScopeLabel: 'Add Type',
  renameScopeLabel: 'Rename Type',
  mergeTitle: 'Merge Locations',
  mergeIntro: 'The following locations now share a name within this type. Saving will merge each set into a single location and combine their details.',
  mergeSummary: 'details combined',
  fields: [
    { key: 'name', label: 'Name', width: 'w-44' },
    { key: 'address', label: 'Address', width: 'w-56', render: addressField },
    { key: 'contactName', label: 'Contact', width: 'w-36' },
    { key: 'phone', label: 'Phone', width: 'w-32' },
    { key: 'email', label: 'Email', width: 'w-48' },
    { key: 'notes', label: 'Notes', width: 'w-40' },
    { key: 'nearbyHospital', label: 'Nearest Hospital', width: 'w-40', render: nearbyField('hospital') },
    { key: 'nearbyPolice', label: 'Nearest Police', width: 'w-40', render: nearbyField('police') },
  ],
  mergeableFields: ['address', 'place', 'lat', 'lng', 'contactName', 'phone', 'email', 'notes', 'nearbyHospital', 'nearbyPolice'],
  categories: project => project.locationTypes || [],
  addCategory(dispatch, label, categories) {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const key = resolveTypeKey(trimmed, categories);
    if (!key || categories.some(t => t.key === key)) return null;
    dispatch({ type: 'ADD_LOCATION_TYPE', payload: { type: { key, label: trimmed } } });
    return key;
  },
  renameCategory(dispatch, key, label) {
    dispatch({ type: 'RENAME_LOCATION_TYPE', payload: { key, label } });
  },
  deleteCategoryConfirm(category, itemCount) {
    return {
      title: `Delete "${category.label}"?`,
      message: itemCount > 0
        ? `This type has ${itemCount} location${itemCount !== 1 ? 's' : ''}. Removing it also removes them from the locations list.`
        : 'This type will be removed from the catalog.',
      suppressKey: 'lemon_schedule_dnwa_delete_location_type',
    };
  },
  deleteCategory(dispatch, key) {
    dispatch({ type: 'DELETE_LOCATION_TYPE', payload: key });
  },
  loadRows: buildLocationRows,
  makeBlankRow: () => ({ key: String(Date.now()), id: '', name: '', address: '', place: '', lat: '', lng: '', contactName: '', phone: '', email: '', notes: '', nearbyHospital: '', nearbyPolice: '' }),
  commitPlan: commitLocationPlan,
  sortModes: [
    { key: 'name', label: 'By Name', comparator: (a, b) => (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase()) },
    { key: 'address', label: 'By Address', comparator: (a, b) => (a.address || a.name).toLowerCase().localeCompare((b.address || b.name).toLowerCase()) },
    { key: 'phone', label: 'By Phone', comparator: (a, b) => (a.phone || a.name).toLowerCase().localeCompare((b.phone || b.name).toLowerCase()) },
  ],
};

export { computeManagerDiff, typeLabelOf };
