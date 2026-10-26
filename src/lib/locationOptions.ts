import type { Project } from '../types';
import { resolvedLocationName } from './locations';

/** The dropdown action row that opens the shared location picker. */
export const ADD_LOCATION_SENTINEL = '__add_location__';

export interface LocationOption {
  id: string;
  name: string;
  /** Dropdown group header (a location type label, or a quick-pick bucket). */
  group?: string;
  /** Renders emerald (the "Add new location…" action row). */
  accent?: boolean;
  /** Extra searchable attributes for catalogue pickers (the kit SearchMenu
   *  face — roadmap 318): address, contact, phone. Cell editors ignore them. */
  fields?: { label: string; value: string }[];
}

/**
 * Items for EVERY location picker (crew Report-to cells, day Locations grid,
 * header selects): the emerald add-new action first, then any quick-pick
 * extras (e.g. the day's scene names), then the Locations DB GROUPED BY TYPE
 * in the type registry's order. The list is pre-ordered — entity editors must
 * keep it as-is (`sortItems: list => list`), never re-sort alphabetically
 * across groups.
 */
export function locationOptions(project: Project, extra: LocationOption[] = []): LocationOption[] {
  const types = project.locationTypes || [];
  const byType = new Map<string, LocationOption[]>();
  const order: string[] = types.map(t => t.key);
  const labelOf = new Map(types.map(t => [t.key, t.label]));
  for (const l of project.locations || []) {
    if (!byType.has(l.type)) {
      byType.set(l.type, []);
      if (!order.includes(l.type)) order.push(l.type);
    }
    byType.get(l.type)!.push({
      id: l.id,
      name: resolvedLocationName(l.name, l.address, l.place, l.lat, l.lng),
      group: labelOf.get(l.type) || l.type,
      fields: [
        { label: 'Address', value: l.address || '' },
        { label: 'Place', value: l.place || '' },
        { label: 'Contact', value: l.contactName || '' },
        { label: 'Phone', value: l.phone || '' },
      ].filter(f => f.value.trim()),
    });
  }
  const extraIds = new Set(extra.map(e => e.id));
  const dbItems = order.flatMap(typeKey =>
    (byType.get(typeKey) || [])
      .filter(item => !extraIds.has(item.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  );
  return [
    { id: ADD_LOCATION_SENTINEL, name: 'Add new location…', accent: true },
    ...extra,
    ...dbItems,
  ];
}
