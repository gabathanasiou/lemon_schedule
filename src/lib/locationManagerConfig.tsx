import React, { useState } from 'react';
import type { Project, ProjectLocation } from '../types';
import { generateUUID } from './utils';
import { resolveTypeKey, typeLabelOf } from './locations';
import { LocationPickerModal } from '../components/location/LocationPickerModal';
import { type PickedLocation } from './places';
import DropdownMenu from '../components/DropdownMenu';
import DropdownItem from '../components/DropdownItem';
import { Check, ChevronDown } from 'lucide-react';
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

/** A location's display identity: name, falling back to address → place → "lat, lng". */
const resolvedName = (
  name?: string | null,
  address?: string | null,
  place?: string | null,
  lat?: string | number | null,
  lng?: string | number | null,
): string => {
  const n = (name || '').trim();
  if (n) return n;
  const a = (address || '').trim();
  if (a) return a;
  const p = (place || '').trim();
  if (p) return p;
  if (lat != null && lat !== '' && lng != null && lng !== '') return `${lat}, ${lng}`;
  return '';
};

function buildLocationRows(project: Project, type: string): ManagerRow[] {
  return (project.locations || []).filter(l => l.type === type).map(l => ({
    key: l.id,
    id: l.id,
    // Identity = the RESOLVED name (display + rename diff + delete-on-blank):
    // a blank stored name falls back to address → place → pin. Locations never
    // merge (canMerge false), so identical identities are always distinct rows.
    name: resolvedName(l.name, l.address, l.place, l.lat, l.lng),
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
    name: resolvedName(row.name, row.address, row.place, row.lat, row.lng) || '',
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
      } else if (k === 'name' && !(v || '').trim()) {
        // A blank identity is never stored — resolve from the row's other fields.
        const src = { ...existing, ...u.updates };
        patch[k] = resolvedName(src.name, src.address, src.place, src.lat, src.lng) || undefined;
      } else if (v === '') {
        patch[k] = undefined;
      } else {
        patch[k] = v;
      }
    }
    // Persist the resolved name for still-blank rows (name falls back to
    // address → place → pin). Locations never merge, so an identical identity
    // on another row is fine — the rows stay distinct.
    if (existing && !(existing.name || '').trim() && !('name' in u.updates)) {
      const src = { ...existing, ...u.updates };
      const resolved = resolvedName(src.name, src.address, src.place, src.lat, src.lng);
      if (resolved) patch.name = resolved;
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
  const apply = (loc: PickedLocation) => {
    if (!(row.name || '').trim()) update('name', (loc.address || loc.place || '').trim());
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
      <LocationPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={loc => { apply(loc); setOpen(false); }}
        initial={hasPin ? { lat: Number(row.lat), lng: Number(row.lng), place: row.place || undefined, address: row.address || undefined } : null}
      />
    </>
  );
};

const addressField = (row: ManagerRow, update: (f: string, v: string) => void, readOnly: boolean) => (
  <AddressCell row={row} update={update} readOnly={readOnly} />
);

/** A "nearest facility" cell: kit dropdown picking another location row of the given type. */
const NearbyCell: React.FC<{
  kind: 'hospital' | 'police';
  row: ManagerRow;
  update: (f: string, v: string) => void;
  readOnly: boolean;
  project: Project;
}> = ({ kind, row, update, readOnly, project }) => {
  const [open, setOpen] = useState(false);
  const typeKey = kind === 'hospital' ? 'hospital' : 'policeStation';
  const key = kind === 'hospital' ? 'nearbyHospital' : 'nearbyPolice';
  const options = (project.locations || []).filter(l => l.type === typeKey && l.id !== row.key);
  const current = row[key] || '';
  const currentLoc = current ? (project.locations || []).find(l => l.id === current) : undefined;
  const currentLabel = currentLoc
    ? resolvedName(currentLoc.name, currentLoc.address, currentLoc.place, currentLoc.lat, currentLoc.lng)
    : '';
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      width="w-56"
      theme="light"
      trigger={
        <button
          type="button"
          disabled={readOnly}
          title={`Set nearest ${typeKey === 'hospital' ? 'hospital' : 'police station'}`}
          className="w-full flex items-center justify-between gap-1 text-left bg-white border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-700 hover:border-zinc-400 transition-colors disabled:opacity-40"
        >
          <span className="truncate">{currentLabel || '—'}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-400" />
        </button>
      }
    >
      <DropdownItem onClick={() => update(key, '')} icon={!current ? <Check className="w-3.5 h-3.5" /> : undefined}>
        —
      </DropdownItem>
      {options.map(l => (
        <DropdownItem key={l.id} onClick={() => update(key, l.id)} icon={current === l.id ? <Check className="w-3.5 h-3.5" /> : undefined}>
          {resolvedName(l.name, l.address, l.place, l.lat, l.lng)}
        </DropdownItem>
      ))}
      {current && !options.some(l => l.id === current) && (
        <DropdownItem onClick={() => update(key, current)} icon={<Check className="w-3.5 h-3.5" />}>
          {currentLabel || '…'}
        </DropdownItem>
      )}
    </DropdownMenu>
  );
};

/** A "nearest facility" dropdown: picks another location row of the given type. */
const nearbyField = (kind: 'hospital' | 'police') => (row: ManagerRow, update: (f: string, v: string) => void, readOnly: boolean, ctx: { project: Project }) => (
  <NearbyCell kind={kind} row={row} update={update} readOnly={readOnly} project={ctx.project} />
);

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
    { key: 'name', label: 'Name', width: 'min-w-44' },
    { key: 'address', label: 'Address', width: 'min-w-56', render: addressField },
    { key: 'contactName', label: 'Contact', width: 'min-w-36' },
    { key: 'phone', label: 'Phone', width: 'min-w-32' },
    { key: 'email', label: 'Email', width: 'min-w-48' },
    { key: 'notes', label: 'Notes', width: 'min-w-40' },
    { key: 'nearbyHospital', label: 'Nearest Hospital', width: 'min-w-40', render: nearbyField('hospital') },
    { key: 'nearbyPolice', label: 'Nearest Police', width: 'min-w-40', render: nearbyField('police') },
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
  canMerge: false,
  sortModes: [
    { key: 'name', label: 'By Name', comparator: (a, b) => resolvedName(a.name, a.address, a.place, a.lat, a.lng).toLowerCase().localeCompare(resolvedName(b.name, b.address, b.place, b.lat, b.lng).toLowerCase()) },
    { key: 'address', label: 'By Address', comparator: (a, b) => (a.address || resolvedName(a.name, a.address, a.place, a.lat, a.lng)).toLowerCase().localeCompare((b.address || resolvedName(b.name, b.address, b.place, b.lat, b.lng)).toLowerCase()) },
    { key: 'phone', label: 'By Phone', comparator: (a, b) => (a.phone || resolvedName(a.name, a.address, a.place, a.lat, a.lng)).toLowerCase().localeCompare((b.phone || resolvedName(b.name, b.address, b.place, b.lat, b.lng)).toLowerCase()) },
  ],
};

export { computeManagerDiff, typeLabelOf };
