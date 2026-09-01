import type { CrewRole, ProjectLocation } from '../types';
import { generateUUID } from './utils';

// Locations database — a flat list of places, each with a type (from
// `project.locationTypes`), an address + map pin, contact details and
// nearest-facility links. Scenes/days will reference these by stable id later.

export const DEFAULT_LOCATION_TYPES: CrewRole[] = [
  { key: 'set', label: 'Set', builtin: true },
  { key: 'unitBase', label: 'Unit Base', builtin: true },
  { key: 'hospital', label: 'Hospital', builtin: true },
  { key: 'policeStation', label: 'Police Station', builtin: true },
];

export const LOCATION_BUILTIN_KEYS = new Set(DEFAULT_LOCATION_TYPES.map(t => t.key));

export function slugifyTypeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || generateUUID().slice(0, 8);
}

/**
 * Resolves a type cell value (label or typed text) to a type key:
 * exact label match first, then slug match, else a fresh slug for a NEW type.
 * Returns null for empty input.
 */
export function resolveTypeKey(text: string, types: CrewRole[]): string | null {
  const t = text.trim();
  if (!t) return null;
  const byLabel = types.find(x => x.label.toLowerCase() === t.toLowerCase());
  if (byLabel) return byLabel.key;
  const slug = slugifyTypeLabel(t);
  const bySlug = types.find(x => x.key === slug);
  return bySlug ? bySlug.key : slug;
}

export function typeLabelOf(location: ProjectLocation, types: CrewRole[]): string {
  return types.find(t => t.key === location.type)?.label || location.type;
}

/** A location's display identity: name, falling back to address → place → pin
 *  ("lat, lng"). Shared by the Locations Manager, the scene-sheet Location
 *  picker and the nearest-facility cells — never re-derived. */
export function resolvedLocationName(
  name?: string | null,
  address?: string | null,
  place?: string | null,
  lat?: string | number | null,
  lng?: string | number | null,
): string {
  const n = (name || '').trim();
  if (n) return n;
  const a = (address || '').trim();
  if (a) return a;
  const p = (place || '').trim();
  if (p) return p;
  if (lat != null && lat !== '' && lng != null && lng !== '') return `${lat}, ${lng}`;
  return '';
}
