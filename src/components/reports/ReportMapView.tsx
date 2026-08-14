import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ReportBlock } from '../../types';
import { ReportCtx } from '../../lib/reportData';
import { getReportLocation, reportLocationLabel, reportLocationLink, MapLinkKind } from '../../lib/reportWeather';
import { MapPin, ExternalLink } from 'lucide-react';

// Static (non-interactive) map view for report blocks — renders in the
// designer canvas, preview and print. Tiles are <img> elements, so they print.
// OSM raster tiles: free, no API key (same setup as the "updates" project).
//
// Location resolution: `mapInheritLocation` → getReportLocation(ctx, item)
// (the same seam the Sun & Weather fields use; London until the per-day
// location DB lands). Otherwise the block's own pin (mapLat/mapLng/mapPlace).

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const OPEN_LINK_LABELS: Record<string, string> = {
  google: 'Open in Google Maps',
  apple: 'Open in Apple Maps',
  citymapper: 'Open in Citymapper',
};

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

const LINK_BTN = 'inline-flex items-center gap-1 rounded bg-zinc-900 text-white px-2 py-1 text-[10px] font-medium';

export const ReportMapView: React.FC<{
  block: ReportBlock;
  ctx?: ReportCtx;
  item?: any;
  hint?: boolean; // designer canvas: inert controls so block selection works
}> = ({ block, ctx, item, hint }) => {
  let lat = block.mapLat;
  let lng = block.mapLng;
  let place = block.mapPlace;
  if (block.mapInheritLocation && ctx) {
    const loc = getReportLocation(ctx, item);
    lat = loc.lat;
    lng = loc.lng;
    place = loc.place;
  }
  if (lat == null || lng == null) {
    return hint ? <div style={{ color: '#a1a1aa', fontStyle: 'italic' }}>Add a location…</div> : null;
  }
  const position: [number, number] = [lat, lng];
  const showAddress = !!block.mapShowAddress;
  const openLink = (block.mapOpenLink || 'none') as MapLinkKind | 'none';
  const href = openLink === 'none' ? null : reportLocationLink(openLink, { lat, lng, place, timezone: 'UTC' });
  const addressText = reportLocationLabel({ lat, lng, place, timezone: 'UTC' });

  return (
    <div className="rounded-sm overflow-hidden border border-zinc-300">
      <div className="relative" style={{ height: block.mapHeight ?? 240 }}>
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
            <Marker position={position} icon={locationMarker()} interactive={false} />
            <MapResize />
          </MapContainer>
        </div>
        {!showAddress && place && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-white/90 border border-zinc-200 rounded px-2 py-0.5 text-[10px] text-zinc-700 max-w-[70%] truncate pointer-events-none">
            <MapPin className="w-3 h-3 text-zinc-400 shrink-0" /> {place}
          </div>
        )}
        {!showAddress && href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={`${LINK_BTN} absolute bottom-1.5 right-1.5 ${hint ? 'pointer-events-none' : ''}`}
          >
            <ExternalLink className="w-3 h-3" /> {OPEN_LINK_LABELS[openLink]}
          </a>
        )}
      </div>
      {showAddress && (
        <div className="flex items-center gap-2 border-t border-zinc-300 bg-zinc-50 px-2 py-1">
          <span className="flex items-center gap-1 min-w-0 truncate text-[10px]">
            <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
            {href ? (
              // The address text itself is the link — prints as the location
              // name, clickable in the PDF.
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={`truncate text-zinc-700 underline underline-offset-2 ${hint ? 'pointer-events-none' : ''}`}
              >
                {addressText}
              </a>
            ) : (
              <span className="truncate text-zinc-600">{addressText}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};
