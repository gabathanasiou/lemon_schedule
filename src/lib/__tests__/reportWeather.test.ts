import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatTempC,
  formatWeatherValue,
  fetchSunWeatherBatch,
  sunWeatherFieldValue,
  daySunWeather,
  getReportLocation,
  reverseGeocodeAddress,
  getCachedAddress,
  type ReportLocation,
} from '../reportWeather';
import type { ReportCtx } from '../reportData';
import type { DayWeatherOverride } from '../../types';

const isoDay = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/** Minimal ctx: the weather/location seam only reads `project.locations` +
 *  the timezone. */
const makeCtx = () => ({
  project: {
    locations: [
      { id: 'loc-scene', name: 'Scene Place', type: 'set', lat: 40, lng: -3, place: 'Scene Place' },
      { id: 'loc-master', name: 'Master', type: 'set', lat: 51.5, lng: -0.12, place: 'Master Place' },
    ],
    productionInfo: { timezone: 'Europe/London' },
  },
}) as unknown as ReportCtx;

describe('formatTempC', () => {
  it('rounds to the nearest degree and appends the unit', () => {
    expect(formatTempC(23.6)).toBe('24°C');
    expect(formatTempC(17.2)).toBe('17°C');
  });

  it('renders an em dash when the API returned no value', () => {
    expect(formatTempC(null)).toBe('—');
  });
});

describe('report location resolution (weather follows the day master)', () => {
  it('prefers the day master location, then a DB-matched scene location, then blank', () => {
    const ctx = makeCtx();
    expect(getReportLocation(ctx, { locationId: 'loc-master', sceneLocations: ['Scene Place'] }))
      .toMatchObject({ lat: 51.5, lng: -0.12, place: 'Master Place' });
    expect(getReportLocation(ctx, { sceneLocations: ['Scene Place'] }))
      .toMatchObject({ lat: 40, lng: -3 });
    expect(getReportLocation(ctx, {})).toMatchObject({ lat: 0, lng: 0 });
  });
});

describe('sunWeatherFieldValue — master-location weather', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fills sunrise/temps from the MASTER location, not the scene fallback', async () => {
    const date = isoDay(0);
    const master: ReportLocation = { lat: 51.5, lng: -0.12, timezone: 'Europe/London', place: 'Master Place' };
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      const url = String(input);
      urls.push(url);
      const u = new URL(url);
      const tempMax = u.searchParams.get('latitude') === '51.5' ? 21 : 33;
      return {
        ok: true,
        json: async () => ({
          daily: {
            time: [date],
            sunrise: [`${date}T07:00`],
            sunset: [`${date}T19:00`],
            weather_code: [0],
            temperature_2m_max: [tempMax],
            temperature_2m_min: [tempMax - 10],
          },
        }),
      } as any;
    }));

    await fetchSunWeatherBatch(master, [date]);

    // The day carries BOTH a master location and a scene location — the master wins.
    const dayInfo = { date, locationId: 'loc-master', sceneLocations: ['Scene Place'] };
    const ctx = makeCtx();
    expect(urls[0]).toContain('latitude=51.5');
    expect(sunWeatherFieldValue(ctx, dayInfo, undefined, 'sunrise')).toBe('07:00');
    expect(sunWeatherFieldValue(ctx, dayInfo, undefined, 'tempHigh')).toBe('21°C');
    expect(sunWeatherFieldValue(ctx, dayInfo, undefined, 'tempLow')).toBe('11°C');
  });

  it('falls back to the DB-matched scene location when the day has no master', async () => {
    const date = isoDay(1);
    const sceneLoc: ReportLocation = { lat: 40, lng: -3, timezone: 'Europe/London', place: 'Scene Place' };
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      const url = String(input);
      return {
        ok: true,
        json: async () => ({
          daily: {
            time: [date],
            sunrise: [`${date}T06:00`],
            sunset: [`${date}T20:00`],
            weather_code: [1],
            temperature_2m_max: [33],
            temperature_2m_min: [24],
          },
        }),
      } as any;
    }));

    await fetchSunWeatherBatch(sceneLoc, [date]);

    const dayInfo = { date, sceneLocations: ['Scene Place'] };
    expect(sunWeatherFieldValue(makeCtx(), dayInfo, undefined, 'tempHigh')).toBe('33°C');
  });
});

describe('sunWeatherFieldValue — unavailable weather', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows "No forecast yet" for dates beyond the forecast horizon (no fetch attempted)', async () => {
    const date = isoDay(30);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const loc: ReportLocation = { lat: 51.5, lng: -0.12, timezone: 'Europe/London', place: 'Master Place' };
    await fetchSunWeatherBatch(loc, [date]);
    expect(fetchMock).not.toHaveBeenCalled();

    const dayInfo = { date, locationId: 'loc-master', sceneLocations: ['Scene Place'] };
    expect(sunWeatherFieldValue(makeCtx(), dayInfo, undefined, 'tempHigh')).toBe('No forecast yet');
    expect(sunWeatherFieldValue(makeCtx(), dayInfo, undefined, 'sunrise')).toBe('No forecast yet');
  });

  it('keeps the dash before a fetch has resolved (not a miss)', () => {
    const dayInfo = { date: isoDay(2), locationId: 'loc-master', sceneLocations: ['Scene Place'] };
    expect(sunWeatherFieldValue(makeCtx(), dayInfo, undefined, 'weather')).toBe('—');
  });
});

describe('manual day weather override (roadmap 301)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A ctx whose single day optionally carries a manual weather override. */
  const makeDayCtx = (date: string, override?: DayWeatherOverride, locationId: string | undefined = 'loc-master') => ({
    project: {
      locations: [{ id: 'loc-master', name: 'Master', type: 'set', lat: 52.1, lng: -1.2, place: 'Master Place' }],
      productionInfo: { timezone: 'Europe/London' },
    },
    dayInfos: [{ date, locationId, sceneLocations: [], weatherOverride: override }],
  }) as unknown as ReportCtx;

  /** Seed the session cache for one pin/date (the API part of an override). */
  const seed = async (date: string, lat: number, lng: number, weatherCode = 0) => {
    const loc: ReportLocation = { lat, lng, timezone: 'Europe/London', place: 'Seed' };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        daily: {
          time: [date],
          sunrise: [`${date}T07:00`],
          sunset: [`${date}T19:00`],
          weather_code: [weatherCode],
          temperature_2m_max: [21],
          temperature_2m_min: [11],
        },
      }),
    } as any)));
    await fetchSunWeatherBatch(loc, [date]);
    vi.unstubAllGlobals();
  };

  it('works without a location pin and marks the view manual', () => {
    const date = isoDay(3);
    const ctx = makeDayCtx(date, { enabled: true, weather: 'Hail', tempMin: 2, tempMax: 5 }, 'missing');
    const view = daySunWeather(ctx, date);
    expect(view).toMatchObject({
      hasPin: false,
      manual: true,
      entry: { weather: 'Hail', tempMin: 2, tempMax: 5 },
    });
    expect(sunWeatherFieldValue(ctx, ctx.dayInfos[0], undefined, 'weather')).toBe('Hail · 2–5°C');
  });

  it('fills blank override fields from the fetched day weather', async () => {
    const date = isoDay(4);
    await seed(date, 52.1, -1.2);
    const ctx = makeDayCtx(date, { enabled: true, weather: 'Hail' });
    expect(sunWeatherFieldValue(ctx, ctx.dayInfos[0], undefined, 'weather')).toBe('Hail · 11–21°C');
    expect(sunWeatherFieldValue(ctx, ctx.dayInfos[0], undefined, 'sunrise')).toBe('07:00');
    expect(daySunWeather(ctx, date).entry).toMatchObject({ weather: 'Hail', sunrise: '07:00' });
  });

  it('a disabled override keeps the typed values but shows the API', async () => {
    const date = isoDay(5);
    await seed(date, 52.1, -1.2);
    const ctx = makeDayCtx(date, { enabled: false, weather: 'Hail' });
    expect(sunWeatherFieldValue(ctx, ctx.dayInfos[0], undefined, 'weather')).toBe('Clear sky · 11–21°C');
    expect(daySunWeather(ctx, date).manual).toBe(false);
  });

  it('never replaces another pin or an explicit location pick', async () => {
    const date = isoDay(6);
    await seed(date, 52.1, -1.2);
    await seed(date, 41, -4);
    const ctx = makeDayCtx(date, { enabled: true, weather: 'Hail' });
    const other = { id: 'other', name: 'Other', type: 'set', typeLabel: 'Set', lat: 41, lng: -4, place: 'Other Place' };
    expect(sunWeatherFieldValue(ctx, other, { dayDate: date }, 'weather')).toBe('Clear sky · 11–21°C');
    expect(sunWeatherFieldValue(ctx, other, { dayDate: date, locationChoice: 'set' }, 'weather'))
      .toBe('Clear sky · 11–21°C');
    expect(sunWeatherFieldValue(ctx, ctx.dayInfos[0], undefined, 'weather')).toBe('Hail · 11–21°C');
  });

  it('formatWeatherValue drops empty parts for a partly filled override', () => {
    expect(formatWeatherValue({ sunrise: '', sunset: '', weather: 'Rain', tempMin: null, tempMax: null })).toBe('Rain');
    expect(formatWeatherValue({ sunrise: '', sunset: '', weather: '', tempMin: null, tempMax: null })).toBe('');
  });
});

describe('reverseGeocodeAddress — through the places provider (roadmap 297)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses Google Geocoding when a key is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      urls.push(String(input));
      return {
        ok: true,
        json: async () => ({ results: [{ formatted_address: '10 Downing Street, London' }] }),
      } as any;
    }));

    // Unique coords — the module cache is process-wide across tests.
    await reverseGeocodeAddress(12.3456, 78.9);
    expect(urls[0]).toContain('maps.googleapis.com');
    expect(getCachedAddress(12.3456, 78.9)).toBe('10 Downing Street, London');
  });

  it('caches a failed fetch as null and never retries it', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) } as any));
    vi.stubGlobal('fetch', fetchMock);

    await reverseGeocodeAddress(23.4567, 89.1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedAddress(23.4567, 89.1)).toBeNull();

    await reverseGeocodeAddress(23.4567, 89.1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // cache hit — no second call
  });
});

// ---------------------------------------------------------------------------
// Stored weather across sessions (roadmap 299): the module cache is session
// scoped; the device store (localStorage) is what makes settled history
// one-fetch-ever. `vi.resetModules()` + dynamic import simulates a fresh
// session against the same storage.

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

/** Minimal ctx for prepare: one day at `date` resolving to a pinned location. */
function makeStoreCtx(date: string, id: string) {
  return {
    project: {
      id,
      locations: [{ id: 'loc', name: 'Stage', type: 'set', lat: 34.02, lng: -118.39, place: 'Stage Place' }],
      productionInfo: { timezone: 'Europe/London' },
    },
    dayInfos: [{ date, locationId: 'loc', sceneLocations: [] }],
  } as unknown as ReportCtx;
}

function mockWeatherFetch(urls: string[]) {
  return vi.fn(async (input: any) => {
    urls.push(String(input));
    const u = new URL(String(input));
    const start = u.searchParams.get('start_date')!;
    const end = u.searchParams.get('end_date')!;
    const days: string[] = [];
    const d = new Date(start + 'T12:00:00Z');
    const endD = new Date(end + 'T12:00:00Z');
    while (d <= endD) { days.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return {
      ok: true,
      json: async () => ({
        daily: {
          time: days,
          sunrise: days.map(x => `${x}T07:00`),
          sunset: days.map(x => `${x}T19:00`),
          weather_code: days.map(() => 0),
          temperature_2m_max: days.map(() => 20),
          temperature_2m_min: days.map(() => 10),
        },
      }),
    } as any;
  });
}

describe('stored weather — past days fetch once, ever (roadmap 299)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('serves a settled past day from the store in a later session, with zero fetches', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    // Recent past — within the store's 2-year retention window.
    const past = isoDay(-30);
    const ctx = makeStoreCtx(past, 'proj-settled');

    const urls1: string[] = [];
    vi.stubGlobal('fetch', mockWeatherFetch(urls1));
    const session1 = await import('../reportWeather');
    await session1.prepareSunWeatherForCtx(ctx);
    expect(urls1).toHaveLength(1);
    expect(urls1[0]).toContain('archive-api.open-meteo.com');

    // "New session": fresh module (empty memory cache), same storage.
    vi.resetModules();
    const urls2: string[] = [];
    vi.stubGlobal('fetch', mockWeatherFetch(urls2));
    const session2 = await import('../reportWeather');
    await session2.prepareSunWeatherForCtx(ctx);
    expect(urls2).toHaveLength(0);

    const info = session2.daySunWeather(ctx, past);
    expect(info.hasPin).toBe(true);
    expect(info.entry?.sunrise).toBe('07:00');
    expect(info.entry?.weather).toBe('Clear sky');
  });

  it('refetches an UPCOMING day when the stored value is older than 6 h', async () => {
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    const today = new Date().toISOString().slice(0, 10);
    const ctx = makeStoreCtx(today, 'proj-stale');

    const urls1: string[] = [];
    vi.stubGlobal('fetch', mockWeatherFetch(urls1));
    const session1 = await import('../reportWeather');
    await session1.prepareSunWeatherForCtx(ctx);
    expect(urls1).toHaveLength(1);

    // Age the stored entry by 7 h, then simulate a later session.
    const raw = JSON.parse(ls.getItem('lemon_schedule_weather_v1_proj-stale')!);
    for (const k of Object.keys(raw.weather)) raw.weather[k].at -= 7 * 60 * 60 * 1000;
    ls.setItem('lemon_schedule_weather_v1_proj-stale', JSON.stringify(raw));

    vi.resetModules();
    const urls2: string[] = [];
    vi.stubGlobal('fetch', mockWeatherFetch(urls2));
    const session2 = await import('../reportWeather');
    await session2.prepareSunWeatherForCtx(ctx);
    expect(urls2).toHaveLength(1); // stale → refetched
  });

  it('does NOT refetch a fresh upcoming day', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const today = new Date().toISOString().slice(0, 10);
    const ctx = makeStoreCtx(today, 'proj-fresh');

    const urls1: string[] = [];
    vi.stubGlobal('fetch', mockWeatherFetch(urls1));
    const s1 = await import('../reportWeather');
    await s1.prepareSunWeatherForCtx(ctx);
    expect(urls1).toHaveLength(1);

    vi.resetModules();
    const urls2: string[] = [];
    vi.stubGlobal('fetch', mockWeatherFetch(urls2));
    const s2 = await import('../reportWeather');
    await s2.prepareSunWeatherForCtx(ctx);
    expect(urls2).toHaveLength(0); // fresh (< 6 h) — served from the store
  });

  it('force-refresh re-pulls even a settled past day', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const past = isoDay(-30);
    const ctx = makeStoreCtx(past, 'proj-force');

    const urls1: string[] = [];
    vi.stubGlobal('fetch', mockWeatherFetch(urls1));
    const s1 = await import('../reportWeather');
    await s1.prepareSunWeatherForCtx(ctx);
    expect(urls1).toHaveLength(1);

    const urls2: string[] = [];
    vi.stubGlobal('fetch', mockWeatherFetch(urls2));
    await s1.refreshSunWeatherForCtx(ctx, past);
    expect(urls2).toHaveLength(1); // past + settled — explicit refresh still re-pulls
    expect(s1.daySunWeather(ctx, past).entry?.sunrise).toBe('07:00');
  });
});
