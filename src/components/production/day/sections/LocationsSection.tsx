import React, { useMemo, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import GroupedSelect, { GroupedSelectItem } from '../GroupedSelect';
import { LocationPickerModal } from '../../../location/LocationPickerModal';
import { resolvedLocationName, typeLabelOf } from '../../../../lib/locations';
import { generateUUID } from '../../../../lib/utils';
import type { PickedLocation } from '../../../../lib/places';
import type { ProjectLocation } from '../../../../types';

const LocationsSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly, dispatch }) => {
  const [picking, setPicking] = useState(false);
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

  const createFromPick = (picked: PickedLocation) => {
    const name = (picked.place || picked.address || 'New location').trim();
    const location: ProjectLocation = {
      id: generateUUID(),
      name,
      type: 'set',
      address: picked.address,
      place: picked.place,
      lat: picked.lat,
      lng: picked.lng,
    };
    dispatch({ type: 'ADD_LOCATION', payload: { location } });
    patchMeta({ locationId: location.id });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Master location</div>
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
              <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 shrink-0">
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Key locations</div>
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
          {master && <Chip label={resolvedLocationName(master.name, master.address, master.place, master.lat, master.lng)} sub={typeLabelOf(master, types)} />}
          {day.keyLocations.map(l => <Chip key={l.id} label={resolvedLocationName(l.name, l.address, l.place, l.lat, l.lng)} sub={typeLabelOf(l, types)} />)}
        </div>
      )}

      {(nearestHospital || nearestPolice) && (
        <div className="text-[11px] text-zinc-500 space-y-0.5">
          {nearestHospital && <div>Nearest hospital: <span className="text-zinc-700">{resolvedLocationName(nearestHospital.name, nearestHospital.address, nearestHospital.place, nearestHospital.lat, nearestHospital.lng)}</span></div>}
          {nearestPolice && <div>Nearest police: <span className="text-zinc-700">{resolvedLocationName(nearestPolice.name, nearestPolice.address, nearestPolice.place, nearestPolice.lat, nearestPolice.lng)}</span></div>}
        </div>
      )}

      <LocationPickerModal open={picking} onClose={() => setPicking(false)} onConfirm={picked => { setPicking(false); createFromPick(picked); }} />
    </div>
  );
};

const Chip: React.FC<{ label: string; sub?: string }> = ({ label, sub }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-800">
    <MapPin className="w-3 h-3" />
    {label}
    {sub && <span className="text-emerald-500">{sub}</span>}
  </span>
);

export const LocationsIcon = MapPin;

export default LocationsSection;
