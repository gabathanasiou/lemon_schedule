import React, { useMemo, useState } from 'react';
import { MapPin, Pencil, Plus } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import GroupedSelect, { GroupedSelectItem } from '../GroupedSelect';
import { LocationPickerModal } from '../../../location/LocationPickerModal';
import { resolvedLocationName, typeLabelOf } from '../../../../lib/locations';
import { generateUUID } from '../../../../lib/utils';
import type { PickedLocation } from '../../../../lib/places';
import type { ProjectLocation } from '../../../../types';

/** The picker is open either to CREATE a new location or to EDIT one already
 *  attached (master / key location chip) — editing must never spawn a duplicate
 *  DB row. */
type PickerState = { mode: 'new' } | { mode: 'edit'; location: ProjectLocation } | null;

const LocationsSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly, dispatch }) => {
  const [picker, setPicker] = useState<PickerState>(null);
  const locations = project.locations || [];
  const types = project.locationTypes || [];

  const items: GroupedSelectItem[] = useMemo(() => {
    // Scene-derived names come FIRST (they're what the day is actually shot
    // at); picking one creates the Locations-DB entry on the fly. Then the
    // Locations DB, grouped by type.
    const dbNames = new Set(locations.map(l => l.name.trim().toLowerCase()));
    const sceneItems: GroupedSelectItem[] = day.sceneLocations
      .filter(name => !dbNames.has(name.trim().toLowerCase()))
      .map(name => ({ id: `scene:${name}`, name }));
    const dbItems: GroupedSelectItem[] = locations.map(l => ({
      id: l.id,
      name: resolvedLocationName(l.name, l.address, l.place, l.lat, l.lng),
      group: typeLabelOf(l, types),
      hint: l.address && l.address !== l.name ? l.address : undefined,
    }));
    return [...sceneItems, ...dbItems];
  }, [locations, types, day.sceneLocations]);

  /** Maps a picker id to a real Locations-DB id, creating a DB entry for a
   *  scene-derived name. */
  const resolveLocationId = (id: string): string => {
    if (!id.startsWith('scene:')) return id;
    const name = id.slice(6);
    const existing = locations.find(l => l.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing.id;
    const created: ProjectLocation = { id: generateUUID(), name, type: 'set' };
    dispatch({ type: 'ADD_LOCATION', payload: { location: created } });
    return created.id;
  };

  const locationOf = (id?: string): ProjectLocation | undefined => locations.find(l => l.id === id);
  const master = day.masterLocation;
  const nearby = master?.nearby;
  const nearestHospital = locationOf(nearby?.hospitalId);
  const nearestPolice = locationOf(nearby?.policeId);

  const savePick = (picked: PickedLocation) => {
    // A text-only confirm carries no coordinates — never invent a pin.
    const coords = picked.lat != null && picked.lng != null ? { lat: picked.lat, lng: picked.lng } : {};
    if (picker?.mode === 'edit') {
      const { location } = picker;
      dispatch({
        type: 'UPDATE_LOCATION',
        payload: {
          id: location.id,
          updates: {
            ...(!(location.name || '').trim() ? { name: (picked.place || picked.address || '').trim() } : {}),
            address: picked.address,
            place: picked.place,
            ...coords,
          },
        },
      });
      return;
    }
    const name = (picked.place || picked.address || 'New location').trim();
    const location: ProjectLocation = {
      id: generateUUID(),
      name,
      type: 'set',
      address: picked.address,
      place: picked.place,
      ...coords,
    };
    dispatch({ type: 'ADD_LOCATION', payload: { location } });
    patchMeta({ locationId: location.id });
  };

  const editPicker = picker?.mode === 'edit' ? picker.location : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)] mb-0.5">Master location</div>
          <p className="text-[10px] text-[color:var(--ui-text-faint)] mb-1">Where the crew reports — the day's home base (call sheets + nearby services use it).</p>
          <div className="flex items-center gap-1.5">
            <GroupedSelect
              className="flex-1 min-w-0"
              items={items}
              mode="single"
              selectedIds={master ? [master.id] : []}
              disabled={readOnly}
              placeholder="No master location"
              onChange={ids => patchMeta({ locationId: ids[0] ? resolveLocationId(ids[0]) : undefined })}
            />
            {!readOnly && (
              <button type="button" onClick={() => setPicker({ mode: 'new' })} className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] shrink-0">
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)] mb-0.5">Key locations</div>
          <p className="text-[10px] text-[color:var(--ui-text-faint)] mb-1">Any additional locations worked this day — choose more than one.</p>
          <GroupedSelect
            className="w-full"
            items={items}
            mode="multi"
            selectedIds={day.meta.locationIds || []}
            disabled={readOnly}
            placeholder="Add key locations…"
            onChange={ids => patchMeta({ locationIds: ids.length ? ids.map(resolveLocationId) : undefined })}
          />
        </div>
      </div>

      {(master || day.keyLocations.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {master && (
            <LocationChip
              location={master}
              types={types}
              readOnly={readOnly}
              onEdit={() => setPicker({ mode: 'edit', location: master })}
            />
          )}
          {day.keyLocations.map(l => (
            <LocationChip
              key={l.id}
              location={l}
              types={types}
              readOnly={readOnly}
              onEdit={() => setPicker({ mode: 'edit', location: l })}
            />
          ))}
        </div>
      )}

      {(nearestHospital || nearestPolice) && (
        <div className="text-[11px] text-[color:var(--ui-text-muted)] space-y-0.5">
          {nearestHospital && <div>Nearest hospital: <span className="text-[color:var(--ui-text)]">{resolvedLocationName(nearestHospital.name, nearestHospital.address, nearestHospital.place, nearestHospital.lat, nearestHospital.lng)}</span></div>}
          {nearestPolice && <div>Nearest police: <span className="text-[color:var(--ui-text)]">{resolvedLocationName(nearestPolice.name, nearestPolice.address, nearestPolice.place, nearestPolice.lat, nearestPolice.lng)}</span></div>}
        </div>
      )}

      <LocationPickerModal
        open={picker !== null}
        onClose={() => setPicker(null)}
        onConfirm={picked => { setPicker(null); savePick(picked); }}
        initial={
          editPicker
            ? {
                lat: editPicker.lat,
                lng: editPicker.lng,
                place: editPicker.place,
                address: editPicker.address,
              }
            : null
        }
      />
    </div>
  );
};

/** A day location pill — click to edit the attached location's pin/address. */
const LocationChip: React.FC<{
  location: ProjectLocation;
  types: DaySectionProps['project']['locationTypes'];
  readOnly: boolean;
  onEdit: () => void;
}> = ({ location, types, readOnly, onEdit }) => (
  <button
    type="button"
    onClick={onEdit}
    disabled={readOnly}
    title="Edit this location's address and pin"
    className="group inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 transition-colors disabled:opacity-60"
  >
    <MapPin className="w-3 h-3" />
    {resolvedLocationName(location.name, location.address, location.place, location.lat, location.lng)}
    <span className="text-emerald-500">{typeLabelOf(location, types)}</span>
    <Pencil className="w-2.5 h-2.5 text-emerald-500 opacity-60 group-hover:opacity-100" />
  </button>
);

export const LocationsIcon = MapPin;

export default LocationsSection;
