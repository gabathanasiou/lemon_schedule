import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Modal, { ModalFooter } from '../Modal';
import { Search, MapPin, Crosshair, Loader2 } from 'lucide-react';

// Location picker for map blocks: address search (Nominatim forward geocode)
// + tap-to-pin (Nominatim reverse geocode) — same keyless services as the
// "updates" project's LocationPicker, adapted to the report designer Modal.

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const MAX_PLACE = 120;
const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]; // London — matches the fixed report location

export interface PickedLocation {
  lat: number;
  lng: number;
  place?: string;
}

function locationMarker() {
  return L.divIcon({
    className: '',
    html: '<div style="width:22px;height:22px;background:#ff9e8a;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (!el) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function TapToPin({ onPin }: { onPin: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPin(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return '';
    const data = await res.json();
    return (data?.display_name || '').slice(0, MAX_PLACE);
  } catch {
    return '';
  }
}

interface SearchResult { lat: number; lng: number; label: string }

export const LocationPickerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (loc: PickedLocation) => void;
}> = ({ open, onClose, onConfirm }) => {
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [place, setPlace] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const geocodeSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset on open + best-effort geolocation centering (permission-gated).
  useEffect(() => {
    if (!open) return;
    setPin(null);
    setPlace('');
    setQuery('');
    setResults([]);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setCenter(c);
          setPin(c);
          reverseGeocode(c[0], c[1]).then(p => setPlace(p));
        },
        () => {},
        { timeout: 8000, maximumAge: 60000 },
      );
    }
  }, [open]);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const onPin = (lat: number, lng: number) => {
    setPin([lat, lng]);
    const seq = ++geocodeSeq.current;
    reverseGeocode(lat, lng).then(p => { if (geocodeSeq.current === seq) setPlace(p); });
  };

  const search = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5`,
          { headers: { Accept: 'application/json' } },
        );
        if (!res.ok) { setResults([]); return; }
        const data = await res.json();
        setResults((data || []).map((r: any) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name })));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const pickResult = (r: SearchResult) => {
    setPin([r.lat, r.lng]);
    setCenter([r.lat, r.lng]);
    setPlace(r.label.slice(0, MAX_PLACE));
    setResults([]);
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
            onClick={() => pin && onConfirm({ lat: pin[0], lng: pin[1], ...(place ? { place } : {}) })}
            disabled={!pin}
            className="text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded px-3 py-1.5 disabled:opacity-30"
          >
            Attach pin
          </button>
        </ModalFooter>
      }
    >
      <div className="p-6 space-y-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={e => search(e.target.value)}
            placeholder="Search an address or place…"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-md pl-9 pr-8 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
          />
          {searching && <Loader2 className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />}
        </div>
        {results.length > 0 && (
          <div className="border border-zinc-700 rounded-md overflow-hidden">
            {results.map((r, i) => (
              <button
                key={`${r.lat}-${r.lng}-${i}`}
                onClick={() => pickResult(r)}
                className={`w-full text-left px-3 py-2 text-[11px] text-zinc-300 hover:bg-zinc-800 ${i > 0 ? 'border-t border-zinc-800' : ''}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
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
            <TapToPin onPin={onPin} />
            <Recenter center={pin || center} />
            {pin && <Marker position={pin} icon={locationMarker()} />}
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
