// Pluggable place lookup. Default provider is Nominatim (keyless, OpenStreetMap
// data). When VITE_GOOGLE_MAPS_API_KEY is set, Google Places (New) Text Search
// + Geocoding take over. Everything that searches an address goes through
// getPlacesProvider() — never call a geocoding endpoint directly.

const NOMINATIM_SEARCH =
  'https://nominatim.openstreetmap.org/search?q={q}&format=jsonv2&limit=5&addressdetails=1';
const NOMINATIM_REVERSE =
  'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lng}&zoom=16&addressdetails=1';
const GOOGLE_TEXT_SEARCH = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';
const MAX_PLACE = 120;

export interface PlaceParts {
  address?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

/** A resolved place: coordinates + human label + optional structured parts. */
export interface PickedLocation {
  lat: number;
  lng: number;
  place?: string;
  address?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

export interface PlaceResult {
  lat: number;
  lng: number;
  label: string;
  parts: PlaceParts;
}

export interface PlacesProvider {
  /** Search by query string; caller debounces. */
  forwardGeocode(query: string): Promise<PlaceResult[]>;
  /** Resolve coordinates to a place (drop a pin → place name). */
  reverseGeocode(lat: number, lng: number): Promise<PlaceResult | null>;
}

/** Maps Nominatim's `address` object onto our structured parts. */
function nominatimParts(addr: any): PlaceParts {
  const street = [addr?.house_number, addr?.road].filter(Boolean).join(' ');
  const out: PlaceParts = {};
  if (street) out.address = street;
  const city = addr?.city || addr?.town || addr?.village || addr?.suburb;
  if (city) out.city = city;
  if (addr?.postcode) out.postcode = addr.postcode;
  if (addr?.country) out.country = addr.country;
  return out;
}

const nominatimProvider: PlacesProvider = {
  async forwardGeocode(query) {
    try {
      const res = await fetch(
        NOMINATIM_SEARCH.replace('{q}', encodeURIComponent(query)),
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map((r: any) => ({
        lat: Number(r.lat),
        lng: Number(r.lon),
        label: r.display_name,
        parts: nominatimParts(r.address),
      }));
    } catch {
      return [];
    }
  },
  async reverseGeocode(lat, lng) {
    try {
      const res = await fetch(
        NOMINATIM_REVERSE.replace('{lat}', String(lat)).replace('{lng}', String(lng)),
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const place = (data?.display_name || '').slice(0, MAX_PLACE);
      if (!place) return null;
      return { lat, lng, label: place, parts: nominatimParts(data?.address) };
    } catch {
      return null;
    }
  },
};

/** Places API (New) — displayName + formattedAddress + location, no breakdown. */
const googleProvider: PlacesProvider = {
  async forwardGeocode(query) {
    try {
      const res = await fetch(GOOGLE_TEXT_SEARCH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleApiKey()!,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.location',
        },
        body: JSON.stringify({ textQuery: query, pageSize: 5 }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data?.places || []).map((p: any) => ({
        lat: p.location.latitude,
        lng: p.location.longitude,
        label: [p.displayName?.text, p.formattedAddress].filter(Boolean).join(', ').slice(0, MAX_PLACE),
        parts: { address: p.formattedAddress },
      }));
    } catch {
      return [];
    }
  },
  async reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`${GOOGLE_GEOCODE}?latlng=${lat},${lng}&key=${googleApiKey()!}`);
      if (!res.ok) return null;
      const data = await res.json();
      const r = data?.results?.[0];
      if (!r) return null;
      return {
        lat,
        lng,
        label: (r.formatted_address || '').slice(0, MAX_PLACE),
        parts: { address: r.formatted_address },
      };
    } catch {
      return null;
    }
  },
};

function googleApiKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
}

export function getPlacesProvider(): PlacesProvider {
  return googleApiKey() ? googleProvider : nominatimProvider;
}

/** Turn a resolved place into the canonical PickedLocation shape. */
export function toPickedLocation(r: PlaceResult): PickedLocation {
  return { lat: r.lat, lng: r.lng, place: r.label, ...r.parts };
}

/** Best-effort center for a map with no location yet (London). */
export const DEFAULT_MAP_CENTER: [number, number] = [51.5074, -0.1278];
