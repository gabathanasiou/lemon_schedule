import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Crosshair } from 'lucide-react';
import Modal, { ModalFooter } from '../Modal';
import {
  getPlacesProvider,
  type PickedLocation,
  type PlaceParts,
  type PlaceResult,
  DEFAULT_MAP_CENTER,
} from '../../lib/places';
import {
  MapResize,
  Recenter,
  teardropHTML,
  OSM_TILES,
  OSM_ATTRIBUTION,
} from '../map/MapPrimitives';
import { AsyncResultsDropdown, type AsyncResultItem } from './AsyncResultsDropdown';

type PlaceHit = AsyncResultItem & { result: PlaceResult };

// Location picker for map surfaces: address search (results float in a
// dropdown, never growing the modal) + Apple Maps–style static center pin
// (drag the map to place — the pin never moves) + a "center on my location"
// button. The picked location is the map's current center at confirm time;
// the place label settles via debounced reverse geocode after each move.
// The Address input is a manual override — it follows the geocoded street
// until edited, so a street number the geocoder can't match (e.g. "Mikras
// Asias 92" in a thinly-mapped area) can still be committed by hand.

function CenterProbe({ onCenterMove }: { onCenterMove: (lat: number, lng: number) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      onCenterMove(c.lat, c.lng);
    },
  });
  return null;
}

const GEOCODE_DEBOUNCE_MS = 350;

export const LocationPickerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (loc: PickedLocation) => void;
  /** Existing pin to edit — opens centered on it (with its label) instead of the default center. */
  initial?: PickedLocation | null;
}> = ({ open, onClose, onConfirm, initial }) => {
  const [place, setPlace] = useState('');
  const [parts, setParts] = useState<PlaceParts | null>(null);
  const [query, setQuery] = useState('');
  const [address, setAddress] = useState('');
  const [center, setCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const geocodeSeq = useRef(0);
  const geocodeTimer = useRef<number | null>(null);
  // Last acknowledged map center — lets moveend-driven updates that settle on
  // the SAME coordinates be no-ops (Recenter's setView fires a moveend; without
  // this guard it would re-setCenter forever).
  const centerRef = useRef<[number, number]>(DEFAULT_MAP_CENTER);
  // A search pick centers the map programmatically — its own label is already
  // the right place name, so the moveend-driven reverse geocode is skipped.
  const skipNextGeocode = useRef(false);
  // The address input is a manual OVERRIDE: it follows geocoded parts until
  // the user edits it (e.g. to type a street number the geocoder can't match),
  // then it stops following and the typed text wins on confirm.
  const addressTouched = useRef(false);

  // Reset on open — centered on the location being edited when there is one
  // (no geolocation auto-center — the locate-me button does it). `initial` is
  // only meaningful at open time: while open, the modal owns its own state.
  useEffect(() => {
    if (!open) return;
    const start: [number, number] =
      initial?.lat != null && initial.lng != null ? [initial.lat, initial.lng] : DEFAULT_MAP_CENTER;
    setPlace(initial?.place || '');
    setParts(initial ? { address: initial.address, city: initial.city, postcode: initial.postcode, country: initial.country } : null);
    setQuery(initial?.place || '');
    setAddress(initial?.address || '');
    addressTouched.current = false;
    setCenter(start);
    centerRef.current = start;
    skipNextGeocode.current = false;
  }, [open]);

  useEffect(() => {
    return () => {
      if (geocodeTimer.current !== null) window.clearTimeout(geocodeTimer.current);
    };
  }, []);

  const search = async (q: string): Promise<PlaceHit[]> => {
    const found = await getPlacesProvider().forwardGeocode(q);
    return found.map(r => ({ key: `${r.lat}|${r.lng}|${r.label}`, label: r.label, result: r }));
  };

  const pickResult = (hit: PlaceHit) => {
    const { result } = hit;
    skipNextGeocode.current = true;
    setCenter([result.lat, result.lng]);
    centerRef.current = [result.lat, result.lng];
    setPlace(result.label);
    setParts(result.parts);
    setQuery(result.label);
    if (!addressTouched.current) setAddress(result.parts.address || '');
  };

  const onCenterMove = (lat: number, lng: number) => {
    const [clat, clng] = centerRef.current;
    if (Math.abs(clat - lat) < 1e-7 && Math.abs(clng - lng) < 1e-7) {
      // Same spot (Recenter driven or a settled drag) — nothing to update.
      skipNextGeocode.current = false;
      return;
    }
    centerRef.current = [lat, lng];
    setCenter([lat, lng]);
    if (skipNextGeocode.current) {
      skipNextGeocode.current = false;
      return;
    }
    const s = ++geocodeSeq.current;
    if (geocodeTimer.current !== null) window.clearTimeout(geocodeTimer.current);
    geocodeTimer.current = window.setTimeout(() => {
      getPlacesProvider()
        .reverseGeocode(lat, lng)
        .then(r => {
          if (geocodeSeq.current === s && r) {
            setPlace(r.label);
            setParts(r.parts);
            if (!addressTouched.current) setAddress(r.parts.address || '');
          }
        });
    }, GEOCODE_DEBOUNCE_MS);
  };

  const recenter = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach a location"
      width="max-w-lg"
      icon={<MapPin className="w-3.5 h-3.5" />}
      footer={
        <ModalFooter>
          <button onClick={onClose} className="text-[11px] text-zinc-400 hover:text-zinc-200 px-3 py-1.5">Cancel</button>
          <button
            onClick={() => onConfirm({ lat: center[0], lng: center[1], ...(place ? { place } : {}), ...(parts || {}), address: address.trim() || undefined })}
            className="text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded px-3 py-1.5"
          >
            Attach pin
          </button>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <AsyncResultsDropdown
          value={query}
          onValueChange={setQuery}
          search={search}
          onPick={pickResult}
          placeholder="Search an address or place…"
        />
        <input
          value={address}
          onChange={e => { addressTouched.current = true; setAddress(e.target.value); }}
          placeholder={place ? 'Street number / address' : 'Street number / address (or drag to drop a pin)'}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
        />
        <div className="rounded-md overflow-hidden border border-zinc-700 relative">
          <MapContainer
            center={center}
            zoom={14}
            scrollWheelZoom={false}
            keyboard={false}
            className="h-full w-full"
            style={{ height: 288 }}
          >
            <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
            <CenterProbe onCenterMove={onCenterMove} />
            <Recenter center={center} />
            <MapResize />
          </MapContainer>
          {/* Static pin at the map's center — never moves while dragging. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-[1000]"
            style={{ transform: 'translate(-50%, -100%)' }}
            dangerouslySetInnerHTML={{ __html: teardropHTML }}
          />
          <button
            onClick={recenter}
            className="absolute right-2 top-2 z-[1000] bg-zinc-900/90 border border-zinc-700 rounded p-1.5 text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Center on my location"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-400 min-h-4">
          <span className="truncate">{place || 'Drag the map to place the pin'}</span>
          <span className="shrink-0 text-zinc-500">{center[0].toFixed(4)}, {center[1].toFixed(4)}</span>
        </div>
      </div>
    </Modal>
  );
};
