import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
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
  TapToPin,
  locationMarker,
  OSM_TILES,
  OSM_ATTRIBUTION,
} from '../map/MapPrimitives';
import { AsyncResultsDropdown, type AsyncResultItem } from './AsyncResultsDropdown';

type PlaceHit = AsyncResultItem & { result: PlaceResult };

// Location picker for map surfaces: address search (results float in a
// dropdown, never growing the modal) + tap-to-pin (reverse geocode) + a
// "center on my location" button. Same keyless services as the shared provider.

export const LocationPickerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (loc: PickedLocation) => void;
}> = ({ open, onClose, onConfirm }) => {
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [place, setPlace] = useState('');
  const [parts, setParts] = useState<PlaceParts | null>(null);
  const [query, setQuery] = useState('');
  const [center, setCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const geocodeSeq = useRef(0);

  // Reset on open (no geolocation auto-center — the locate-me button does it).
  useEffect(() => {
    if (!open) return;
    setPin(null);
    setPlace('');
    setParts(null);
    setQuery('');
    setCenter(DEFAULT_MAP_CENTER);
  }, [open]);

  const search = async (q: string): Promise<PlaceHit[]> => {
    const found = await getPlacesProvider().forwardGeocode(q);
    return found.map(r => ({ key: `${r.lat}|${r.lng}|${r.label}`, label: r.label, result: r }));
  };

  const pickResult = (hit: PlaceHit) => {
    const { result } = hit;
    const c: [number, number] = [result.lat, result.lng];
    setPin(c);
    setCenter(c);
    setPlace(result.label);
    setParts(result.parts);
    setQuery(result.label);
  };

  const onMapPin = (lat: number, lng: number) => {
    setPin([lat, lng]);
    const s = ++geocodeSeq.current;
    getPlacesProvider()
      .reverseGeocode(lat, lng)
      .then(r => {
        if (geocodeSeq.current === s && r) {
          setPlace(r.label);
          setParts(r.parts);
        }
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
            onClick={() => pin && onConfirm({ lat: pin[0], lng: pin[1], ...(place ? { place } : {}), ...(parts || {}) })}
            disabled={!pin}
            className="text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded px-3 py-1.5 disabled:opacity-30"
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
        <div className="rounded-md overflow-hidden border border-zinc-700 relative">
          <MapContainer
            center={pin || center}
            zoom={14}
            scrollWheelZoom={false}
            keyboard={false}
            className="h-full w-full"
            style={{ height: 288 }}
          >
            <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
            <TapToPin onPin={onMapPin} />
            <Recenter center={pin || center} />
            {pin && <Marker position={pin} icon={locationMarker()} interactive={false} />}
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
        <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-400 min-h-4">
          <span className="truncate">{place || (pin ? '…' : 'Tap the map to drop a pin')}</span>
          {pin && <span className="shrink-0 text-zinc-500">{pin[0].toFixed(4)}, {pin[1].toFixed(4)}</span>}
        </div>
      </div>
    </Modal>
  );
};
