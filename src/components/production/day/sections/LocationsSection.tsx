import React, { useCallback, useMemo, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import { GridCellKind } from '@glideapps/glide-data-grid';
import type { DaySectionProps } from '../daySectionTypes';
import type { ProjectLocation } from '../../../../types';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit, type InlineGlideRowAction } from '../../../InlineGlideTable';
import { seededTextCell, textCell } from '../../../../lib/glideCells';
import { createDayTimesTheme } from '../../../../lib/glideTheme';
import { locationFromPick, resolvedLocationName, typeLabelOf } from '../../../../lib/locations';
import { ADD_LOCATION_SENTINEL, locationOptions } from '../../../../lib/locationOptions';
import { addDayLocation, dayLocationRefs, removeDayLocation, replaceDayLocation, setDayMaster } from '../../../../lib/dayLocations';
import { useLocationPicker } from '../../../location/useLocationPicker';
import Button from '../../../Button';
import DropdownMenu from '../../../DropdownMenu';
import DropdownItem from '../../../DropdownItem';
import type { GlideColumnEditor } from '../../../../lib/glideEditor';

/**
 * Locations — the day's locations as ONE Glide board, modelled on the crew
 * roster:
 *   Master (checkbox) · Type · Location (dropdown) · Address · Contact · Phone.
 *
 * Rows are the DAY's attached locations (`dayLocations.dayLocationRefs`: the
 * master pointer into the ordered `locationIds` list). The footer "Add
 * location" menu attaches DB entries / scene quick picks / a brand-new
 * location; the Location cell swaps a row. Data (master + key ids) is
 * unchanged — reports/call sheet read the same `daybreakMeta` fields.
 */

const COLUMNS: InlineGlideColumn[] = [
  { key: 'master', label: 'Master', width: 62, align: 'center' },
  { key: 'type', label: 'Type', width: 112 },
  { key: 'location', label: 'Location', width: 240 },
  { key: 'address', label: 'Address', width: 260 },
  { key: 'contact', label: 'Contact', width: 150 },
  { key: 'phone', label: 'Phone', width: 130 },
];

interface LocationRow extends Record<string, string> {
  key: string;
  locationId: string;
  isMaster: string;
  type: string;
  location: string;
  address: string;
  contact: string;
  phone: string;
}

type PickTarget = { kind: 'add' } | { kind: 'swap'; locationId: string };

const displayName = (l: ProjectLocation) => resolvedLocationName(l.name, l.address, l.place, l.lat, l.lng);

const LocationsSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly, dispatch }) => {
  const types = project.locationTypes || [];
  const [menuOpen, setMenuOpen] = useState(false);
  const locationById = useMemo(() => new Map((project.locations || []).map(l => [l.id, l])), [project.locations]);

  const rows = useMemo<LocationRow[]>(() => dayLocationRefs(day.meta).map(ref => {
    const l = locationById.get(ref.id);
    return {
      key: ref.id,
      locationId: ref.id,
      isMaster: ref.isMaster ? 'true' : 'false',
      type: l ? typeLabelOf(l, types) : '',
      location: l ? displayName(l) : '',
      address: l ? (l.address || l.place || '') : '',
      contact: l?.contactName || '',
      phone: l?.phone || '',
    };
  }), [day.meta, locationById, types]);

  // Scene-derived names still work as quick picks (created in the DB as Set on
  // pick) — often the fastest way to attach a set with no DB row yet.
  const sceneExtras = useMemo(() => {
    const dbNames = new Set((project.locations || []).map(l => l.name.trim().toLowerCase()));
    return day.sceneLocations
      .filter(name => name.trim() && !dbNames.has(name.trim().toLowerCase()))
      .map(name => ({ id: `scene:${name.trim()}`, name: name.trim(), group: 'Scene locations' }));
  }, [day.sceneLocations, project.locations]);
  const items = useMemo(() => locationOptions(project, sceneExtras), [project, sceneExtras]);
  const attached = useMemo(() => new Set(dayLocationRefs(day.meta).map(r => r.id)), [day.meta]);
  // The "Add location" menu lists what is NOT attached yet (add-new first).
  const available = useMemo(
    () => items.filter(item => item.id !== ADD_LOCATION_SENTINEL && !attached.has(item.id)),
    [items, attached],
  );

  const master = day.masterLocation;
  const nearby = master?.nearby;
  const nearestHospital = nearby?.hospitalId ? locationById.get(nearby.hospitalId) : undefined;
  const nearestPolice = nearby?.policeId ? locationById.get(nearby.policeId) : undefined;

  // ONE shared picker mount for the add-new paths.
  const { open: openPicker, node: pickerNode } = useLocationPicker<PickTarget>(project, (target, picked, type) => {
    const created = locationFromPick(picked, type);
    dispatch({ type: 'ADD_LOCATION', payload: { location: created } });
    patchMeta(target.kind === 'swap' ? replaceDayLocation(day.meta, target.locationId, created.id) : addDayLocation(day.meta, created.id));
  });

  const openFor = useCallback((row: LocationRow, address?: string) => {
    openPicker({ kind: 'swap', locationId: row.locationId }, { initial: address ? { address } : null });
  }, [openPicker]);

  /** A scene quick pick: attach the existing DB row or create it as a Set. */
  const sceneLocationId = useCallback((name: string): string => {
    const existing = (project.locations || []).find(l => l.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing.id;
    const location = locationFromPick({ address: name }, 'set');
    dispatch({ type: 'ADD_LOCATION', payload: { location } });
    return location.id;
  }, [dispatch, project.locations]);

  const attach = useCallback((id: string) => {
    setMenuOpen(false);
    if (!id || attached.has(id)) return;
    const realId = id.startsWith('scene:') ? sceneLocationId(id.slice(6)) : id;
    if (attached.has(realId)) return;
    patchMeta(addDayLocation(day.meta, realId));
  }, [attached, patchMeta, day.meta, sceneLocationId]);

  const addNew = useCallback(() => {
    setMenuOpen(false);
    openPicker({ kind: 'add' });
  }, [openPicker]);

  const getEditor = useCallback((rowIndex: number, colKey: string): GlideColumnEditor | undefined | null => {
    if (colKey !== 'location') return undefined;
    const row = rows[rowIndex];
    if (!row) return undefined;
    return {
      kind: 'entity',
      mode: 'single',
      displayMode: 'id',
      items,
      // The list is pre-ordered (action row first, DB grouped by type) —
      // sorting here would split the group headers.
      sortItems: list => list,
      // Typing a type ("set", "unit base") lists that whole group.
      searchFields: ['name', 'group'],
      placeholder: 'Select…',
      renderItem: item => (
        item.id === ADD_LOCATION_SENTINEL
          ? <span className="text-emerald-600">Add new location…</span>
          : <span className="truncate">{item.name}</span>
      ),
      onCreateItem: (val: string) => openFor(row, val),
    };
  }, [rows, items, openFor]);

  const getCellContent = useCallback((col: InlineGlideColumn, row: LocationRow): GridCell => {
    if (col.key === 'master') {
      return {
        kind: GridCellKind.Boolean,
        data: row.isMaster === 'true',
        readonly: !!readOnly,
        allowOverlay: false,
        contentAlign: 'center',
      } as GridCell;
    }
    if (col.key === 'location') {
      // Seed with the name (the editor is id-keyed): picking keeps the exact
      // location id; typed names map back to the DB on commit. Same affordance
      // as the crew Person cell — a ▾ and a pointer, so it reads as a dropdown.
      return seededTextCell(row.location, {
        displayData: `${row.location || '—'}  ▾`,
        readonly: !!readOnly,
        cursor: 'pointer',
      });
    }
    if (col.key === 'type') {
      return textCell(row.type, { readonly: true, allowOverlay: false, cursor: 'default' });
    }
    return textCell(row[col.key] || '—', { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#71717a' } });
  }, [readOnly]);

  const onCommit = useCallback((edits: InlineGlideEdit[]) => {
    let meta = day.meta;
    let changed = false;
    for (const edit of edits) {
      const row = rows[edit.row];
      if (!row) continue;
      if (edit.colKey === 'master') {
        const wanted = edit.value === 'true';
        if (wanted === (row.isMaster === 'true')) continue;
        meta = { ...meta, ...setDayMaster(meta, wanted ? row.locationId : undefined) };
        changed = true;
        continue;
      }
      if (edit.colKey !== 'location') continue;
      const value = edit.value.trim();
      if (value === ADD_LOCATION_SENTINEL) {
        openFor(row);
        continue;
      }
      let id = '';
      if (value.startsWith('scene:')) {
        id = sceneLocationId(value.slice(6));
      } else {
        const byId = (project.locations || []).find(l => l.id === value);
        const byName = (project.locations || []).find(l => displayName(l) === value);
        id = byId?.id ?? byName?.id ?? '';
      }
      if (id && id !== row.locationId) {
        meta = { ...meta, ...replaceDayLocation(meta, row.locationId, id) };
        changed = true;
      }
    }
    if (changed) patchMeta({ locationId: meta.locationId, locationIds: meta.locationIds });
  }, [day.meta, rows, patchMeta, openFor, sceneLocationId, project.locations]);

  const rowActions = useCallback((rowIndex: number): InlineGlideRowAction[] => {
    const row = rows[rowIndex];
    if (!row || readOnly) return [];
    return [{
      key: 'remove',
      title: 'Remove from this day',
      icon: 'trash',
      onClick: () => patchMeta(removeDayLocation(day.meta, row.locationId)),
    }];
  }, [rows, readOnly, patchMeta, day.meta]);

  return (
    <div className="space-y-2" data-day-locations>
      <p className="text-xs text-zinc-500">
        Tick a row to make it the day's master location — the call sheet's home base. Use Add location for more.
      </p>
      <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
        <InlineGlideTable
          dataAttr="data-day-locations-glide"
          presenceScope={`day:${day.sectionIndex}:locations`}
          columns={COLUMNS}
          rows={rows}
          emptyLabel="No locations on this day yet — add the master location below."
          getCellContent={getCellContent}
          onCommit={onCommit}
          editableKeys={new Set(['master', 'location'])}
          readOnly={readOnly}
          createTheme={createDayTimesTheme}
          getEditor={getEditor}
          rowActions={rowActions}
        />
        <div className="px-2 py-1.5 border-t border-zinc-100 flex items-center gap-2">
          <DropdownMenu
            theme="light"
            width="w-80"
            searchable
            searchPlaceholder="Search locations…"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <Button variant="subtle" disabled={readOnly}>
                <Plus className="w-3 h-3" /> Add location
              </Button>
            }
          >
            <DropdownItem onClick={addNew}>
              <span className="text-emerald-600">Add new location…</span>
            </DropdownItem>
            {available.map(item => (
              <DropdownItem
                key={item.id}
                trailing={<span className="opacity-70">{item.group}</span>}
                onClick={() => attach(item.id)}
              >
                {item.name}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </div>
      </div>

      {(nearestHospital || nearestPolice) && (
        <div className="text-[11px] text-zinc-500 space-y-0.5">
          {nearestHospital && <div>Nearest hospital: <span className="text-zinc-700">{displayName(nearestHospital)}</span></div>}
          {nearestPolice && <div>Nearest police: <span className="text-zinc-700">{displayName(nearestPolice)}</span></div>}
        </div>
      )}
      {pickerNode}
    </div>
  );
};

export const LocationsIcon = MapPin;

export default LocationsSection;
