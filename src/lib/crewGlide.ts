import { Project, CrewRole, CrewPerson } from '../types';
import { generateUUID } from './utils';
import { planGridPaste, PasteEdit, PasteColumn, PasteRange } from './glidePaste';
import type { Item } from '@glideapps/glide-data-grid';
import Papa from 'papaparse';

export interface CrewGlideRow {
  id: string;
  roleKey: string;
  role: string;
  name: string;
  phone: string;
  email: string;
}

/** Flattens the crew store (roles × people) into grid rows, in catalog order. */
export function buildCrewRows(crewRoles: CrewRole[], crew: Record<string, CrewPerson[]>): CrewGlideRow[] {
  const rows: CrewGlideRow[] = [];
  for (const r of crewRoles) {
    for (const p of crew[r.key] || []) {
      rows.push({ id: p.id, roleKey: r.key, role: r.label, name: p.name, phone: p.phone || '', email: p.email || '' });
    }
  }
  return rows;
}

export function slugifyRoleLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || generateUUID().slice(0, 8);
}

/**
 * Resolves a role cell value (label or typed text) to a role key:
 * exact label match first, then slug match, else a fresh slug for a NEW role.
 * Returns null for empty input.
 */
export function resolveRoleKey(roleText: string, crewRoles: CrewRole[]): string | null {
  const t = roleText.trim();
  if (!t) return null;
  const byLabel = crewRoles.find(r => r.label.toLowerCase() === t.toLowerCase());
  if (byLabel) return byLabel.key;
  const slug = slugifyRoleLabel(t);
  const bySlug = crewRoles.find(r => r.key === slug);
  return bySlug ? bySlug.key : slug;
}

export interface CrewPasteRow {
  roleKey: string | null;
  roleLabel: string;
  name: string;
  phone: string;
  email: string;
}

/** Crew paste planner — role keys for new rows are pre-computed so dispatch order is deterministic. */
export function planCrewPaste(
  target: Item,
  values: readonly (readonly string[])[],
  rows: CrewGlideRow[],
  columns: PasteColumn[],
  selection: PasteRange | null | undefined,
  crewRoles: CrewRole[],
): { editRows: PasteEdit[]; newRows: CrewPasteRow[] } {
  return planGridPaste<CrewPasteRow>(target, values, rows.length, columns, selection, raw => ({
    roleKey: resolveRoleKey(raw.role || '', crewRoles),
    roleLabel: (raw.role || '').trim(),
    name: (raw.name || '').trim(),
    phone: raw.phone || '',
    email: raw.email || '',
  }));
}

// ---- CSV import / export -----------------------------------------------------

export interface CrewCsvPerson {
  roleLabel: string;
  name: string;
  phone: string;
  email: string;
}

export interface CrewCsvImportResult {
  people: CrewCsvPerson[];
  newRoles: { key: string; label: string }[];
  skipped: number;
}

/** Parses a crew CSV (headers: Role, Name, Phone, Email — case-insensitive). */
export async function parseCrewCSV(file: File, crewRoles: CrewRole[]): Promise<CrewCsvImportResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const people: CrewCsvPerson[] = [];
  const newRoles: { key: string; label: string }[] = [];
  let skipped = 0;
  const knownKeys = new Set(crewRoles.map(r => r.key));
  for (const row of parsed.data) {
    const roleLabel = (row['Role'] ?? row['role'] ?? '').trim();
    const name = (row['Name'] ?? row['name'] ?? '').trim();
    const phone = (row['Phone'] ?? row['phone'] ?? '').trim();
    const email = (row['Email'] ?? row['email'] ?? '').trim();
    if (!roleLabel || !name) {
      skipped++;
      continue;
    }
    const key = resolveRoleKey(roleLabel, crewRoles);
    if (key && !knownKeys.has(key)) {
      knownKeys.add(key);
      newRoles.push({ key, label: roleLabel });
    }
    people.push({ roleLabel, name, phone, email });
  }
  return { people, newRoles, skipped };
}

/**
 * Commits a parsed crew CSV in ONE batch: unknown roles are created, then each
 * row merges by role + name (phone/email updated only with non-empty values)
 * or is added as a new member. Returns how many were added/updated.
 */
export function commitCrewImport(
  dispatch: (action: any) => void,
  result: CrewCsvImportResult,
  crewRoles: CrewRole[],
  crew: Record<string, CrewPerson[]>,
): { added: number; updated: number } {
  const allRoles = [...crewRoles, ...result.newRoles];
  let added = 0;
  let updated = 0;
  dispatch({ type: 'BATCH_START' });
  for (const nr of result.newRoles) {
    dispatch({ type: 'ADD_CREW_ROLE', payload: { role: nr } });
  }
  for (const p of result.people) {
    const roleKey = resolveRoleKey(p.roleLabel, allRoles);
    if (!roleKey) continue;
    const existing = (crew[roleKey] || []).find(c => c.name.trim().toLowerCase() === p.name.toLowerCase());
    if (existing) {
      const updates: Partial<CrewPerson> = {};
      if (p.phone && (existing.phone || '') !== p.phone) updates.phone = p.phone;
      if (p.email && (existing.email || '') !== p.email) updates.email = p.email;
      if (Object.keys(updates).length > 0) {
        dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: roleKey, id: existing.id, updates } });
        updated++;
      }
    } else {
      dispatch({ type: 'ADD_CREW_PERSON', payload: { role: roleKey, person: { id: generateUUID(), name: p.name, phone: p.phone, email: p.email } } });
      added++;
    }
  }
  dispatch({ type: 'BATCH_COMMIT' });
  return { added, updated };
}

/** Downloads the flattened crew (roles × people) as a CSV. */
export function exportCrewCSV(project: Project): void {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Role,Name,Phone,Email'];
  for (const r of project.crewRoles || []) {
    for (const p of project.crew?.[r.key] || []) {
      lines.push([r.label, p.name, p.phone || '', p.email || ''].map(esc).join(','));
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.title || 'Crew'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
