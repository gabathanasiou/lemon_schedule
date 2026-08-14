import React, { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Shared Leaflet building blocks for interactive + static maps. The divIcon
// teardrop marker avoids Leaflet's broken default icon paths in bundlers.
// OSM raster tiles are free and keyless (Google tiles drop in later if ever
// needed — the data source lives in lib/places.ts).

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function locationMarker() {
  return L.divIcon({
    className: '',
    html: '<div style="width:22px;height:22px;background:#ff9e8a;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

/** Leaflet pins pixel size at init — invalidate after layout shifts. */
export function MapResize() {
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

export function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

/** Click anywhere on the map to drop a pin. */
export function TapToPin({ onPin }: { onPin: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPin(e.latlng.lat, e.latlng.lng) });
  return null;
}
