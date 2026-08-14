// Sun & Weather data for reports — computed at print time for the day item's
// date. Location comes from getReportLocation() (today: London, fixed); that
// single function is the seam where per-day/per-scene locations will slot in
// when the location DB lands. Timezone comes from the project (Production tab)
// or the browser zone.
//
// API: Open-Meteo (free, no key, CORS):
//  - https://api.open-meteo.com/v1/forecast          — today ± [5d past, 16d ahead]
//  - https://archive-api.open-meteo.com/v1/archive   — any past date (ERA5)
// Both return weather_code + sunrise/sunset in local time via `timezone=`.

import { Project, ScheduleVersion } from '../types';
import { ReportCtx, ReportDaybreakData, buildReportCtx } from './reportData';
import { getBrowserTimeZone } from './timezones';

export interface ReportLocation {
  lat: number;
  lng: number;
  place?: string;
  timezone: string;
}

/** Fixed location until the per-day location DB lands (London). */
export const LONDON_LOCATION = { lat: 51.5074, lng: -0.1278, place: 'London' };

/** The location a report day resolves to. Future location DB: route on the
 *  item (day/scene) here — nothing else in the report pipeline changes. */
export function getReportLocation(ctx: ReportCtx, _item?: any): ReportLocation {
  return {
    ...LONDON_LOCATION,
    timezone: ctx.project.productionInfo?.timezone || getBrowserTimeZone(),
  };
}

export interface SunWeather {
  sunrise: string;   // HH:MM local
  sunset: string;    // HH:MM local
  weather: string;   // WMO label (e.g. "Partly cloudy")
  tempMin: number | null;
  tempMax: number | null;
}

// WMO weather interpretation codes (4677) — the code set Open-Meteo returns.
const WMO_LABELS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
};

export function wmoLabel(code: number): string {
  return WMO_LABELS[code] ?? 'Weather';
}

/** "Partly cloudy · 18–24°C" (temps omitted when the API didn't return them). */
export function formatWeatherValue(w: SunWeather): string {
  const hasTemps = w.tempMin != null && w.tempMax != null;
  const temps = hasTemps
    ? ` · ${Math.round(w.tempMin)}–${Math.round(w.tempMax)}°C`
    : '';
  return `${w.weather}${temps}`;
}

// ---- cache -------------------------------------------------------------------
// Module-level cache keyed by `lat|lng|date`; `null` marks a failed fetch so
// we don't retry on every render. The cache makes repeated prefetch calls
// cheap no-ops (the designer warms it on load; print awaits a fresh batch).

type CacheEntry = SunWeather | null;
const cache = new Map<string, CacheEntry>();

function cacheKey(loc: ReportLocation, date: string): string {
  return `${loc.lat.toFixed(4)}|${loc.lng.toFixed(4)}|${date}`;
}

/** undefined = not fetched yet · null = fetch failed · SunWeather = ready. */
export function getCachedSunWeather(loc: ReportLocation, date: string): CacheEntry | undefined {
  return cache.get(cacheKey(loc, date));
}

// ---- fetch -------------------------------------------------------------------

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY_PARAMS = 'weather_code,sunrise,sunset,temperature_2m_max,temperature_2m_min';

const DAY_MS = 24 * 60 * 60 * 1000;

function endpointFor(date: string): string {
  const today = new Date();
  const d = new Date(`${date}T12:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / DAY_MS);
  // forecast window: 5 days past → 16 days ahead
  return days >= -5 && days <= 16 ? FORECAST_URL : ARCHIVE_URL;
}

function timeOf(iso: string | undefined | null): string {
  if (!iso) return '';
  return iso.length >= 16 ? iso.slice(11, 16) : iso;
}

async function fetchForEndpoint(endpoint: string, loc: ReportLocation, dates: string[]): Promise<void> {
  const sorted = [...dates].sort();
  const url = `${endpoint}?latitude=${loc.lat}&longitude=${loc.lng}` +
    `&daily=${DAILY_PARAMS}&timezone=${encodeURIComponent(loc.timezone)}` +
    `&start_date=${sorted[0]}&end_date=${sorted[sorted.length - 1]}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const data = await res.json();
  const daily = data?.daily;
  if (!daily?.time || !Array.isArray(daily.time)) return;
  const wanted = new Set(sorted);
  for (let i = 0; i < daily.time.length; i++) {
    const d = daily.time[i];
    if (!wanted.has(d)) continue;
    cache.set(cacheKey(loc, d), {
      sunrise: timeOf(daily.sunrise?.[i]),
      sunset: timeOf(daily.sunset?.[i]),
      weather: wmoLabel(daily.weather_code?.[i]),
      tempMin: daily.temperature_2m_min?.[i] ?? null,
      tempMax: daily.temperature_2m_max?.[i] ?? null,
    });
  }
}

/** Fetches sun/weather for the given dates into the cache. Dates already
 *  cached (success or failure) are skipped. Never throws. */
export async function fetchSunWeatherBatch(loc: ReportLocation, dates: string[]): Promise<void> {
  const fresh = dates.filter(d => !cache.has(cacheKey(loc, d)));
  if (fresh.length === 0) return;
  const byEndpoint: Record<string, string[]> = {};
  for (const d of fresh) (byEndpoint[endpointFor(d)] ||= []).push(d);
  await Promise.all(Object.entries(byEndpoint).map(async ([endpoint, ds]) => {
    try {
      await fetchForEndpoint(endpoint, loc, ds);
    } catch {
      for (const d of ds) cache.set(cacheKey(loc, d), null);
    }
  }));
}

// ---- report-facing helpers ----------------------------------------------------

/** Date list a report context needs (every production day). */
export function reportWeatherDates(ctx: ReportCtx): string[] {
  return ctx.dayInfos.map(d => d.date);
}

/** Warms the cache for every day in the context. Used by the designer (canvas
 *  + preview) and awaited before print so window.print() never races the net. */
export async function prepareSunWeatherForCtx(ctx: ReportCtx): Promise<void> {
  const dates = reportWeatherDates(ctx);
  if (dates.length === 0) return;
  await fetchSunWeatherBatch(getReportLocation(ctx), dates);
}

export async function prepareSunWeatherForDesign(project: Project, version: ScheduleVersion, daybreak: ReportDaybreakData): Promise<void> {
  const ctx = buildReportCtx(project, version, daybreak);
  await prepareSunWeatherForCtx(ctx);
}

/** Field get(): the day item's sun/weather. `—` when the data isn't cached
 *  (canvas before a prefetch) or the fetch failed. */
export function sunWeatherFieldValue(ctx: ReportCtx, item: any, kind: 'sunrise' | 'sunset' | 'weather'): string {
  const date = item?.date as string | undefined;
  if (!date) return '—';
  const w = getCachedSunWeather(getReportLocation(ctx, item), date);
  if (!w) return '—';
  if (kind === 'weather') return formatWeatherValue(w);
  return w[kind];
}
