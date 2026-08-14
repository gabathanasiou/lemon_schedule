import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ReportBlock } from '../../types';
import { MapPin } from 'lucide-react';

// Static (non-interactive) map view for report blocks — renders in the
// designer canvas, preview and print. Tiles are <img> elements, so they print.
// OSM raster tiles: free, no API key (same setup as the "updates" project).

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Leaflet's default icon points at broken image paths in bundlers — use a
 *  divIcon teardrop instead (same marker as the "updates" map feature). */
function locationMarker() {
  return L.divIcon({
    className: '',
    html: '<div style="width:22px;height:22px;background:#ff9e8a;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

/** Leaflet pins pixel size at init — invalidate after layout shifts. */
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

export const ReportMapView: React.FC<{ block: ReportBlock; hint?: boolean }> = ({ block, hint }) => {
  if (block.mapLat == null || block.mapLng == null) {
    return hint ? <div style={{ color: '#a1a1aa', fontStyle: 'italic' }}>Add a location…</div> : null;
  }
  const position: [number, number] = [block.mapLat, block.mapLng];
  return (
    <div className="relative rounded-sm overflow-hidden border border-zinc-300" style={{ height: block.mapHeight ?? 240 }}>
      <div className="h-full w-full pointer-events-none">
        <MapContainer
          center={position}
          zoom={block.mapZoom ?? 15}
          scrollWheelZoom={false}
          dragging={false}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
          style={{ background: '#e5e7eb' }}
        >
          <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
          <Marker position={position} icon={locationMarker()} />
          <MapResize />
        </MapContainer>
      </div>
      {block.mapPlace && (
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-white/90 border border-zinc-200 rounded px-2 py-0.5 text-[10px] text-zinc-700 max-w-[80%] truncate pointer-events-none">
          <MapPin className="w-3 h-3 text-zinc-400 shrink-0" /> {block.mapPlace}
        </div>
      )}
    </div>
  );
};
