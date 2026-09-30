import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatTempC,
  fetchSunWeatherBatch,
  sunWeatherFieldValue,
  getReportLocation,
  type ReportLocation,
} from '../reportWeather';
import type { ReportCtx } from '../reportData';

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
