import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, Crosshair, Loader2 } from 'lucide-react';
import { useDropdown, useOpenHandler } from '../../lib/dropdown';
import { useSmartPosition } from '../../lib/useSmartPosition';
import {
  PlaceResult,
  PickedLocation,
  getPlacesProvider,
  toPickedLocation,
  DEFAULT_MAP_CENTER,
} from '../../lib/places';
import {
  MapResize,
  Recenter,
  TapToPin,
  locationMarker,
  OSM_TILES,
  OSM_ATTRIBUTION,
} from '../map/MapPrimitives';

const SEARCH_DEBOUNCE = 400;

// Dropdown (not modal) place picker: async address search + a map with a
// draggable/tappable pin. Picking a search result or dropping a pin sets the
// pending location; "Use this location" commits it via onChange. Shared by the
// reports map block, the Locations Manager and the Locations Glide.

export const LocationPicker: React.FC<{
  value?: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
  onClear?: () => void;
  triggerLabel?: string;
  triggerClassName?: string;
  disabled?: boolean;
}> = ({ value, onChange, onClear, triggerLabel = 'Set location…', triggerClassName, disabled }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const handleOpen = useOpenHandler(setOpen);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const [pending, setPending] = useState<PickedLocation | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const geocodeSeq = useRef(0);

  useSmartPosition(ref, open);

  const close = useCallback(() => {
    setOpen(false);
    setResults([]);
    setSearching(false);
  }, []);

  useDropdown(open, ref, close, panelRef);

  // Initialize the panel from the current value each time it opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setSearching(false);
    if (value && value.lat != null && value.lng != null) {
      const c: [number, number] = [value.lat, value.lng];
      setPin(c);
      setCenter(c);
      setPending(value);
    } else {
      setPin(null);
      setPending(null);
    }
  }, [open, value]);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const search = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const found = await getPlacesProvider().forwardGeocode(q);
      setResults(found);
      setSearching(false);
    }, SEARCH_DEBOUNCE);
  };

  const pickResult = (r: PlaceResult) => {
    const c: [number, number] = [r.lat, r.lng];
    setPin(c);
    setCenter(c);
    setPending(toPickedLocation(r));
    setResults([]);
  };

  const onMapPin = (lat: number, lng: number) => {
    setPin([lat, lng]);
    const seq = ++geocodeSeq.current;
    getPlacesProvider()
      .reverseGeocode(lat, lng)
      .then(r => {
        if (geocodeSeq.current === seq && r) setPending(toPickedLocation(r));
      });
  };

  const recenter = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { timeout: 8000, maximumAge: 60000 },
    );
  };

  const commit = () => {
    if (pending) onChange(pending);
    close();
  };

  const clear = () => {
    onClear?.();
    close();
  };

  return (
    <div
      ref={ref}
      className="relative"
      onMouseDown={e => e.stopPropagation()}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : handleOpen())}
        className={triggerClassName}
      >
        <MapPin className="w-3.5 h-3.5" /> {triggerLabel}
      </button>
      {open && (
        <div
          ref={panelRef}
          data-testid="location-picker-panel"
          className="click-outside-ignore absolute top-full left-0 z-[100] mt-1 w-[340px] bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden"
        >
          <div className="relative border-b border-zinc-200">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={e => search(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && results.length > 0) {
                  e.preventDefault();
                  pickResult(results[0]);
                }
              }}
              placeholder="Search an address or place…"
              className="w-full bg-white pl-9 pr-8 py-2 text-xs text-zinc-800 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-zinc-900"
            />
            {searching && (
              <Loader2 className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
            )}
          </div>

          {results.length > 0 && (
            <div className="max-h-40 overflow-y-auto border-b border-zinc-200">
              {results.map((r, i) => (
                <button
                  key={`${r.lat}-${r.lng}-${i}`}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pickResult(r)}
                  className={`w-full text-left px-3 py-1.5 text-[11px] text-zinc-600 hover:bg-blue-50 hover:text-blue-700 ${i > 0 ? 'border-t border-zinc-100' : ''}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <MapContainer
              center={pin || center}
              zoom={14}
              scrollWheelZoom={false}
              keyboard={false}
              className="h-full w-full"
              style={{ height: 200 }}
            >
              <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
              <TapToPin onPin={onMapPin} />
              <Recenter center={pin || center} />
              {pin && (
                <Marker
                  position={pin}
                  icon={locationMarker()}
                  draggable
                  eventHandlers={{
                    dragend: e => {
                      const m = e.target as L.Marker;
                      onMapPin(m.getLatLng().lat, m.getLatLng().lng);
                    },
                  }}
                />
              )}
              <MapResize />
            </MapContainer>
            <button
              onClick={recenter}
              className="absolute right-2 top-2 z-[1000] bg-zinc-900/90 border border-zinc-700 rounded p-1.5 text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Center on my location"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-t border-zinc-200 px-2 py-1.5">
            <span className="flex-1 truncate text-[10px] text-zinc-400">
              {pending?.place || (pin ? '…' : 'Search or drop a pin on the map')}
            </span>
            {onClear && value && (
              <button
                type="button"
                onClick={clear}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 px-2 py-1 rounded hover:bg-zinc-100"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={commit}
              disabled={!pin}
              className="text-[10px] font-medium bg-zinc-900 hover:bg-zinc-700 text-white rounded px-2.5 py-1 disabled:opacity-30"
            >
              Use this location
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
