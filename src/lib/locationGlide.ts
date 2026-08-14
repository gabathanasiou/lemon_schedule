import type { Project, ProjectLocation, CrewRole } from '../types';
import { generateUUID } from './utils';
import { resolveTypeKey, typeLabelOf } from './locations';
import type { GlideRow, GlideCsvImport } from './glideShell';
import Papa from 'papaparse';

/** Flattens the locations store into grid rows in catalog order. */
export function buildLocationRows(project: Project): GlideRow[] {
  const types = project.locationTypes || [];
  return (project.locations || []).map(l => {
    const label = typeLabelOf(l, types);
    return {
      key: l.id,
      categoryKey: l.type,
      categoryLabel: label,
      type: label,
      name: l.name,
      address: l.address || '',
      contactName: l.contactName || '',
      phone: l.phone || '',
      email: l.email || '',
    };
  });
}

// ---- CSV import / export -----------------------------------------------------

export interface LocationCsvRow {
  typeLabel: string;
  name: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
}

export interface LocationCsvImportResult {
  rows: LocationCsvRow[];
  newTypes: { key: string; label: string }[];
  skipped: number;
}

const csvHeaders = ['Name', 'Type', 'Address', 'Contact', 'Phone', 'Email'];

/** Parses a locations CSV (headers: Name, Type, Address, Contact, Phone, Email). */
export async function parseLocationsCSV(file: File, types: CrewRole[]): Promise<LocationCsvImportResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const rows: LocationCsvRow[] = [];
  const newTypes: { key: string; label: string }[] = [];
  let skipped = 0;
  const knownKeys = new Set(types.map(t => t.key));
  for (const row of parsed.data) {
    const name = (row['Name'] ?? row['name'] ?? '').trim();
    const typeLabel = (row['Type'] ?? row['type'] ?? '').trim();
    if (!name || !typeLabel) {
      skipped++;
      continue;
    }
    const key = resolveTypeKey(typeLabel, types);
    if (key && !knownKeys.has(key)) {
      knownKeys.add(key);
      newTypes.push({ key, label: typeLabel });
    }
    rows.push({
      typeLabel,
      name,
      address: (row['Address'] ?? row['address'] ?? '').trim(),
      contactName: (row['Contact'] ?? row['contact'] ?? '').trim(),
      phone: (row['Phone'] ?? row['phone'] ?? '').trim(),
      email: (row['Email'] ?? row['email'] ?? '').trim(),
    });
  }
  return { rows, newTypes, skipped };
}

/**
 * Commits a parsed locations CSV in ONE batch: unknown types are created, then
 * each row merges by type + name (details updated with non-empty values only)
 * or is added as a new location.
 */
export function commitLocationsImport(
  dispatch: (action: any) => void,
  result: LocationCsvImportResult,
  project: Project,
): { added: number; updated: number } {
  const allTypes = [...(project.locationTypes || []), ...result.newTypes];
  let added = 0;
  let updated = 0;
  // Working set (type → name → location) so rows referencing an earlier
  // row's name in the same import merge against it, not just the store.
  const byType = new Map<string, Map<string, ProjectLocation>>();
  for (const l of project.locations || []) {
    const m = byType.get(l.type) || new Map();
    m.set(l.name.trim().toLowerCase(), l);
    byType.set(l.type, m);
  }
  dispatch({ type: 'BATCH_START' });
  for (const nt of result.newTypes) {
    dispatch({ type: 'ADD_LOCATION_TYPE', payload: { type: nt } });
  }
  for (const r of result.rows) {
    const typeKey = resolveTypeKey(r.typeLabel, allTypes);
    if (!typeKey) continue;
    const m = byType.get(typeKey) || new Map();
    const existing = m.get(r.name.toLowerCase());
    if (existing) {
      const updates: Partial<ProjectLocation> = {};
      if (r.address && (existing.address || '') !== r.address) updates.address = r.address;
      if (r.contactName && (existing.contactName || '') !== r.contactName) updates.contactName = r.contactName;
      if (r.phone && (existing.phone || '') !== r.phone) updates.phone = r.phone;
      if (r.email && (existing.email || '') !== r.email) updates.email = r.email;
      Object.assign(existing, updates);
      if (Object.keys(updates).length > 0) {
        dispatch({ type: 'UPDATE_LOCATION', payload: { id: existing.id, updates } });
        updated++;
      }
    } else {
      const location: ProjectLocation = {
        id: generateUUID(),
        name: r.name,
        type: typeKey,
        address: r.address || undefined,
        contactName: r.contactName || undefined,
        phone: r.phone || undefined,
        email: r.email || undefined,
      };
      m.set(r.name.toLowerCase(), location);
      byType.set(typeKey, m);
      dispatch({ type: 'ADD_LOCATION', payload: { location } });
      added++;
    }
  }
  dispatch({ type: 'BATCH_COMMIT' });
  return { added, updated };
}

/** Downloads the locations list as a CSV. */
export function exportLocationsCSV(project: Project): void {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [csvHeaders.join(',')];
  const types = project.locationTypes || [];
  for (const l of project.locations || []) {
    lines.push([
      l.name,
      typeLabelOf(l, types),
      l.address || '',
      l.contactName || '',
      l.phone || '',
      l.email || '',
    ].map(esc).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.title || 'Locations'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
