import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ReportBlock } from '../../types';
import { ReportCtx } from '../../lib/reportData';
import { ReportLocation, getReportLocation, reportLocationLinkLabel, reportLocationLink, MapLinkKind } from '../../lib/reportWeather';
import { ReportLocationLink } from './ReportLocationLink';
import { MapPin } from 'lucide-react';

// Static (non-interactive) map view for report blocks — renders in the
// designer canvas, preview and print. Tiles are <img> elements, so they print.
// OSM raster tiles: free, no API key (same setup as the "updates" project).
//
// Location resolution: `mapInheritLocation` → getReportLocation(ctx, item)
// (the same seam the Sun & Weather fields use; London until the per-day
// location DB lands). Otherwise the block's own pin + structured parts.
//
// The address bar is ALWAYS shown below the map (short label: address, city
// postcode); when an "Open in" service is selected it becomes the clickable
// link. The map itself re-centers when the pin/zoom changes (react-leaflet's
// center prop is init-only).

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

/** react-leaflet's MapContainer only uses center/zoom at init — pan when the
 *  block's pin or zoom changes (e.g. picking a new location in the editor). */
function MapCenterSync({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const last = useRef(`${center[0]}|${center[1]}|${zoom}`);
  useEffect(() => {
    const key = `${center[0]}|${center[1]}|${zoom}`;
    if (last.current === key) return;
    last.current = key;
    map.setView(center, zoom);
  }, [center[0], center[1], zoom, map]);
  return null;
}

export const ReportMapView: React.FC<{
  block: ReportBlock;
  ctx?: ReportCtx;
  item?: any;
  hint?: boolean; // designer canvas: anchors inert via .block-card a
}> = ({ block, ctx, item, hint }) => {
  // Resolved location: inherited from the day (getReportLocation seam) or the
  // block's own pin + structured parts (from the location picker).
  let loc: ReportLocation;
  if (block.mapInheritLocation && ctx) {
    loc = getReportLocation(ctx, item);
  } else {
    loc = {
      lat: block.mapLat ?? 0,
      lng: block.mapLng ?? 0,
      place: block.mapPlace,
      address: block.mapAddress,
      city: block.mapCity,
      postcode: block.mapPostcode,
      country: block.mapCountry,
      timezone: 'UTC',
    };
  }
  if (loc.lat == null || loc.lng == null) {
    return <div style={{ color: '#a1a1aa', fontStyle: 'italic' }}>Add a location…</div>;
  }
  const position: [number, number] = [loc.lat, loc.lng];
  const zoom = block.mapZoom ?? 15;
  const openLink = (block.mapOpenLink || 'none') as MapLinkKind | 'none';
  const href = openLink === 'none' ? null : reportLocationLink(openLink, loc);
  const addressText = reportLocationLinkLabel(loc);

  return (
    <div className="rounded-sm overflow-hidden border border-zinc-300">
      <div className="relative" style={{ height: block.mapHeight ?? 240 }}>
        <div className="h-full w-full pointer-events-none">
          <MapContainer
            center={position}
            zoom={zoom}
            scrollWheelZoom={false}
            dragging={false}
            zoomControl={false}
            attributionControl={false}
            className="h-full w-full"
            style={{ background: '#e5e7eb' }}
          >
            <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
            <Marker position={position} icon={locationMarker()} interactive={false} />
            <MapCenterSync center={position} zoom={zoom} />
            <MapResize />
          </MapContainer>
        </div>
        {/* Floating location label — the address (street, city postcode) on the
            map itself; a clickable link when an "Open in" service is set. */}
        <div className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-white border border-zinc-300 rounded px-2 py-0.5 text-[10px] max-w-[80%] shadow-sm ${hint ? 'pointer-events-none' : ''}`}>
          <span className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
            {href ? (
              <ReportLocationLink
                href={href}
                label={addressText}
                className="truncate text-zinc-700 underline underline-offset-2"
              />
            ) : (
              <span className="truncate text-zinc-700">{addressText}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
