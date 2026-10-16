import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPlacesProvider } from '../places';

// Provider selection + Google parts mapping (roadmap 297). The Google path
// activates only when VITE_GOOGLE_MAPS_API_KEY is set — stub it per test; the
// keyless fallback must stay Nominatim.

function stubFetch(payload: any): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    urls.push(String(input));
    return { ok: true, json: async () => payload } as any;
  }));
  return urls;
}

describe('places provider selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('falls back to Nominatim without a key', async () => {
    const urls = stubFetch([]);
    await getPlacesProvider().forwardGeocode('somewhere');
    expect(urls[0]).toContain('nominatim.openstreetmap.org');
  });

  it('uses Google Places (New) Text Search when keyed, with structured parts', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const urls = stubFetch({
      places: [{
        displayName: { text: 'Trafalgar Square' },
        formattedAddress: 'Trafalgar Sq, London WC2N 5DN, United Kingdom',
        location: { latitude: 51.508, longitude: -0.128 },
        addressComponents: [
          { longText: 'Trafalgar Square', types: ['route'] },
          { longText: 'London', types: ['postal_town'] },
          { longText: 'WC2N 5DN', types: ['postal_code'] },
          { longText: 'United Kingdom', types: ['country'] },
        ],
      }],
    });

    const [hit] = await getPlacesProvider().forwardGeocode('trafalgar');
    expect(urls[0]).toContain('places.googleapis.com');
    expect(hit.label).toContain('Trafalgar Square');
    expect(hit).toMatchObject({
      lat: 51.508,
      lng: -0.128,
      parts: { address: 'Trafalgar Square', city: 'London', postcode: 'WC2N 5DN', country: 'United Kingdom' },
    });
  });

  it('reverse: maps Geocoding address_components (street_number + route join)', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    stubFetch({
      results: [{
        formatted_address: '112 Maryland Street, London E15 1QD, United Kingdom',
        address_components: [
          { long_name: '112', types: ['street_number'] },
          { long_name: 'Maryland Street', types: ['route'] },
          { long_name: 'London', types: ['locality'] },
          { long_name: 'E15 1QD', types: ['postal_code'] },
          { long_name: 'United Kingdom', types: ['country'] },
        ],
      }],
    });

    const hit = await getPlacesProvider().reverseGeocode(51.5, -0.1);
    expect(hit?.parts).toEqual({
      address: '112 Maryland Street',
      city: 'London',
      postcode: 'E15 1QD',
      country: 'United Kingdom',
    });
  });

  it('reverse: falls back to the formatted address when components are absent', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    stubFetch({ results: [{ formatted_address: 'Somewhere' }] });
    const hit = await getPlacesProvider().reverseGeocode(1, 2);
    expect(hit?.parts).toEqual({ address: 'Somewhere' });
  });
});
