// Sun & Weather data for reports — computed at print time for the day item's
// date. Location comes from getReportLocation() (the day master → DB-matched
// scene location → blank seam; per-day/per-scene locations resolve there).
// Timezone comes from the project (Production tab) or the browser zone.
//
// API: Open-Meteo (free, no key, CORS):
//  - https://api.open-meteo.com/v1/forecast          — today ± [5d past, 15d ahead]
//  - https://archive-api.open-meteo.com/v1/archive   — any past date (ERA5)
// Both return weather_code + sunrise/sunset in local time via `timezone=`.

import { Project, ScheduleVersion, CalendarVersion, ReportDesign, DayWeatherOverride } from '../types';
import { ReportCtx, ReportDaybreakData, buildReportCtx, getReportLocation, pickLocation, designLocationsIn, type ReportLocationInfo } from './reportData';
import { getBrowserTimeZone } from './timezones';
import { partsFromPlace } from './locations';
import { getPlacesProvider } from './places';
import {
  loadSunWeatherStore, mergeSunWeatherStore, needsRefetch,
  weatherKey, labelKey, isPastDate,
  type StoredSunWeather, type StoredLabel,
} from './sunWeatherCache';

export interface ReportLocation {
  lat: number;
  lng: number;
  place?: string;    // full display string
  address?: string;  // street line, e.g. "112 Maryland Street"
  city?: string;     // e.g. "London"
  postcode?: string; // e.g. "E15 1QD"
  country?: string;  // e.g. "United Kingdom"
  timezone: string;
  /** When this resolved location IS a locations-DB entry (roadmap 6). */
  info?: ReportLocationInfo;
  /** Type key of the location (DB entries only; the day seam has none yet). */
  typeKey?: string;
}

/** True when a location has real coordinates to pin a map/link on. Locations
 *  DB entries store missing coords as 0/0, so both-zero means "no pin" — the
 *  same convention the weather prefetch uses. */
export function hasMapPin(loc: ReportLocation): boolean {
  return Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && (loc.lat !== 0 || loc.lng !== 0);
}

// Re-exported from reportData (the single location seam): the day-location
// resolver lives there next to locationsOfItem so both share one home.

export { getReportLocation } from './reportData';

// ---- reverse geocoding (full address for the map block's location picker) -----
// Cache keyed `lat|lng`; `null` marks a failed fetch. Fetched labels persist in
// the device-local store (roadmap 299) — a settled pin never re-calls Google.
// Goes through the ONE provider seam (lib/places.ts) — Google when keyed,
// Nominatim fallback otherwise; never call a geocoding endpoint directly.

const addressCache = new Map<string, string | null>();

/** undefined = not fetched yet · null = fetch failed · string = full address. */
export function getCachedAddress(lat: number, lng: number): string | null | undefined {
  return addressCache.get(labelKey(lat, lng));
}

export async function reverseGeocodeAddress(
  lat: number,
  lng: number,
  collect?: Record<string, StoredLabel>,
): Promise<void> {
  const key = labelKey(lat, lng);
  if (addressCache.has(key)) return;
  const hit = await getPlacesProvider().reverseGeocode(lat, lng); // never throws — providers catch
  const label = hit ? hit.label.slice(0, 160) : null;
  addressCache.set(key, label);
  if (label && collect) collect[key] = { label, at: Date.now() };
}

export interface SunWeather {
  sunrise: string;   // HH:MM local
  sunset: string;    // HH:MM local
  weather: string;   // WMO label (e.g. "Partly cloudy")
  tempMin: number | null;
  tempMax: number | null;
  /** WMO code (4677) — the Day Manager picks its glyph from this. */
  code?: number | null;
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

/** "Partly cloudy · 18–24°C" (temps omitted when the API didn't return them).
 *  Empty parts are dropped, so a partly filled manual override (roadmap 301)
 *  never renders a stray separator. */
export function formatWeatherValue(w: SunWeather): string {
  const temps = w.tempMin != null && w.tempMax != null
    ? `${Math.round(w.tempMin)}–${Math.round(w.tempMax)}°C`
    : '';
  return [w.weather.trim(), temps].filter(Boolean).join(' · ');
}

// ---- location display + map links (shared by the map block and the fields) ----

export type MapLinkKind = 'google' | 'apple' | 'citymapper';

/** Full display string: stored place, else composed from the structured
 *  parts, else a `lat, lng` fallback. */
export function reportLocationLabel(loc: ReportLocation): string {
  if (loc.place) return loc.place;
  const parts = [loc.address, loc.city, loc.postcode, loc.country].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  return `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
}

/** Short link label: `address, city postcode` — the text shown on location
 *  links (map block address bar, link attributes in text). Locations without
 *  stored structured parts (legacy pins) get a best-effort split of the full
 *  place string. Falls back to the city, then the full label. */
export function reportLocationLinkLabel(loc: ReportLocation): string {
  const effective = loc.address || loc.city || loc.postcode ? loc : partsFromPlace(loc.place || '');
  const cityPost = [effective.city, effective.postcode].filter(Boolean).join(' ');
  const joined = [effective.address, cityPost].filter(Boolean);
  if (joined.length > 0) return joined.join(', ');
  if (effective.city) return effective.city;
  return reportLocationLabel(loc);
}

/** Universal https deep links — work in print/PDF (anchors survive the
 *  browser's "Save as PDF" path) and open the app or web page on any device. */
export function reportLocationLink(kind: MapLinkKind, loc: ReportLocation): string {
  const { lat, lng } = loc;
  const q = encodeURIComponent(reportLocationLabel(loc));
  if (kind === 'google') return `https://www.google.com/maps?q=${q}`;
  if (kind === 'apple') return `https://maps.apple.com/?q=${q}`;
  const name = encodeURIComponent(reportLocationLabel(loc));
  return `https://citymapper.com/directions?endcoord=${lat.toFixed(5)}%2C${lng.toFixed(5)}&endname=${name}`;
}

// ---- cache -------------------------------------------------------------------
// Session cache keyed by `lat|lng|date` (weatherKey); `null` marks a session
// failure so we don't retry on every render. Backed by the DEVICE-LOCAL store
// (sunWeatherCache.ts, roadmap 299): values persist per project, so settled
// past days are never re-asked and recent values survive a reload.

type CacheEntry = StoredSunWeather | null;
const cache = new Map<string, CacheEntry>();

/** Why a date resolved to a null cache entry: `too-far` = beyond the Open-Meteo
 *  forecast horizon (no data exists yet), `error` = the fetch failed. Lets the
 *  fields show a hint instead of a bare dash. */
export type WeatherMissReason = 'too-far' | 'error';
const missReasons = new Map<string, WeatherMissReason>();

function cacheKey(loc: ReportLocation, date: string): string {
  return weatherKey(loc.lat, loc.lng, date);
}

/** undefined = not fetched yet · null = fetch failed · SunWeather = ready. */
export function getCachedSunWeather(loc: ReportLocation, date: string): CacheEntry | undefined {
  return cache.get(cacheKey(loc, date));
}

/** The miss reason for a null cache entry (undefined = not a known miss). */
export function getSunWeatherMiss(loc: ReportLocation, date: string): WeatherMissReason | undefined {
  return missReasons.get(cacheKey(loc, date));
}

// ---- fetch -------------------------------------------------------------------

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY_PARAMS = 'weather_code,sunrise,sunset,temperature_2m_max,temperature_2m_min';

const DAY_MS = 24 * 60 * 60 * 1000;

// Open-Meteo's forecast endpoint serves 5 days past → 15 days ahead (16 days
// ahead 400s and takes the WHOLE batch down). Dates beyond that have no data
// yet — they're cached as failed instead of requested.
const FORECAST_PAST_DAYS = 5;
const FORECAST_FUTURE_DAYS = 15;

/** Endpoint that can serve `date`, or null when no endpoint can yet (too far
 *  ahead). Only valid ranges are ever requested — a batch spanning the
 *  forecast/archive boundary with an out-of-range end date used to 400 and
 *  blank every weather field. */
function endpointFor(date: string): string | null {
  const today = new Date();
  const d = new Date(`${date}T12:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / DAY_MS);
  if (days >= -FORECAST_PAST_DAYS && days <= FORECAST_FUTURE_DAYS) return FORECAST_URL;
  if (days < -FORECAST_PAST_DAYS) return ARCHIVE_URL;
  return null;
}

function timeOf(iso: string | undefined | null): string {
  if (!iso) return '';
  return iso.length >= 16 ? iso.slice(11, 16) : iso;
}

async function fetchForEndpoint(
  endpoint: string,
  loc: ReportLocation,
  dates: string[],
  collect?: Record<string, StoredSunWeather>,
): Promise<void> {
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
    const entry: StoredSunWeather = {
      sunrise: timeOf(daily.sunrise?.[i]),
      sunset: timeOf(daily.sunset?.[i]),
      weather: wmoLabel(daily.weather_code?.[i]),
      tempMin: daily.temperature_2m_min?.[i] ?? null,
      tempMax: daily.temperature_2m_max?.[i] ?? null,
      code: daily.weather_code?.[i] ?? null,
      at: Date.now(),
    };
    cache.set(weatherKey(loc.lat, loc.lng, d), entry);
    if (collect) collect[weatherKey(loc.lat, loc.lng, d)] = entry;
  }
}

/** Fetches sun/weather for the given dates into the cache. Dates already
 *  cached (success or failure) are skipped. Fetched values are added to
 *  `collect` for the caller to persist (roadmap 299). Never throws. */
export async function fetchSunWeatherBatch(
  loc: ReportLocation,
  dates: string[],
  collect?: Record<string, StoredSunWeather>,
): Promise<void> {
  const fresh = dates.filter(d => !cache.has(cacheKey(loc, d)));
  if (fresh.length === 0) return;
  const byEndpoint: Record<string, string[]> = {};
  for (const d of fresh) {
    const endpoint = endpointFor(d);
    if (endpoint) (byEndpoint[endpoint] ||= []).push(d);
    else {
      // Beyond the forecast horizon — no data exists yet (this is the "date
      // too far" case the fields label as "No forecast yet"). Never clobber a
      // stale-but-usable seeded value.
      if (cache.get(cacheKey(loc, d)) == null) {
        cache.set(cacheKey(loc, d), null);
        missReasons.set(cacheKey(loc, d), 'too-far');
      }
    }
  }
  await Promise.all(Object.entries(byEndpoint).map(async ([endpoint, ds]) => {
    try {
      await fetchForEndpoint(endpoint, loc, ds, collect);
    } catch {
      for (const d of ds) {
        if (cache.get(cacheKey(loc, d)) == null) {
          cache.set(cacheKey(loc, d), null);
          missReasons.set(cacheKey(loc, d), 'error');
        }
      }
    }
  }));
}

// ---- report-facing helpers ----------------------------------------------------

/** Date list a report context needs (every production day). */
export function reportWeatherDates(ctx: ReportCtx): string[] {
  return ctx.dayInfos.map(d => d.date);
}

/** Warms the cache for every day in the context — at the day-seam location
 *  plus every pinned locations-DB entry the design references (a locations
 *  table/repeater in the design). Used by the designer (canvas + preview) and
 *  awaited before print so window.print() never races the net.
 *
 *  Storage policy (roadmap 299, sunWeatherCache.ts): values seed from the
 *  device-local store; only missing or stale-and-upcoming entries fetch. */
export async function prepareSunWeatherForCtx(ctx: ReportCtx, design?: ReportDesign): Promise<void> {
  const dates = reportWeatherDates(ctx);
  if (dates.length === 0) return;
  // Each day resolves its OWN master/DB-matched location (item 98 seam), plus
  // every locations-DB entry the design references. Dedupe by coordinates.
  const dayLocs = ctx.dayInfos.map(d => getReportLocation(ctx, d));
  const extra = design ? designLocationsIn(ctx, design) : [];
  const seen = new Set<string>();
  const locs = [...dayLocs, ...extra.map(l => ({ lat: l.lat ?? 0, lng: l.lng ?? 0, place: l.place, address: l.address, timezone: ctx.project.productionInfo?.timezone || getBrowserTimeZone() } as ReportLocation))]
    .filter(l => (l.place || l.address) && hasMapPin(l))
    .filter(l => {
      const key = `${l.lat},${l.lng}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const store = loadSunWeatherStore(ctx.project.id);
  const pending: Array<{ loc: ReportLocation; dates: string[] }> = [];
  const pendingLabels: ReportLocation[] = [];
  const staleSeeds: Array<{ loc: ReportLocation; date: string }> = [];
  for (const loc of locs) {
    // Reverse-geocode only locations with no place name yet (DB entries carry
    // their own address); seed from the store so a settled pin never re-asks.
    if (!loc.place) {
      const lk = labelKey(loc.lat, loc.lng);
      if (addressCache.get(lk) == null && store.labels[lk]) addressCache.set(lk, store.labels[lk].label);
      if (addressCache.get(lk) === undefined) pendingLabels.push(loc);
    }
    const owed: string[] = [];
    for (const date of dates) {
      const k = weatherKey(loc.lat, loc.lng, date);
      if (cache.get(k) !== undefined) continue; // session value (fetched, seeded or a known miss) — never re-ask intra-session
      const stored = store.weather[k];
      if (stored && !needsRefetch(stored, date)) {
        cache.set(k, stored); // settled or still fresh — serve it
        continue;
      }
      // Missing, or stale-and-upcoming: owed a fetch. A stale value is NOT
      // seeded now (it would read as "fetched" and block the batch) — it is
      // re-seeded below only when the refetch did not land.
      if (stored) staleSeeds.push({ loc, date });
      owed.push(date);
    }
    if (owed.length > 0) pending.push({ loc, dates: owed });
  }

  const collectedWeather: Record<string, StoredSunWeather> = {};
  const collectedLabels: Record<string, StoredLabel> = {};
  await Promise.all([
    ...pending.map(p => fetchSunWeatherBatch(p.loc, p.dates, collectedWeather)),
    ...pendingLabels.map(l => reverseGeocodeAddress(l.lat, l.lng, collectedLabels)),
  ]);
  // A stale value whose refetch missed the net: show it rather than a dash.
  for (const { loc, date } of staleSeeds) {
    const k = weatherKey(loc.lat, loc.lng, date);
    const stored = store.weather[k];
    if (stored && cache.get(k) == null) cache.set(k, stored);
  }
  mergeSunWeatherStore(ctx.project.id, collectedWeather, collectedLabels);
}

/** Force one production day's weather (roadmap 299 — the Day Manager chip):
 *  bypasses the stored/freshness policy, re-pulls that date's resolved
 *  location (the archive endpoint for past dates) and persists the result. */
export async function refreshSunWeatherForCtx(ctx: ReportCtx, date: string): Promise<void> {
  const infos = ctx.dayInfos.filter(d => d.date === date);
  if (infos.length === 0) return;
  const collectedWeather: Record<string, StoredSunWeather> = {};
  const collectedLabels: Record<string, StoredLabel> = {};
  for (const info of infos) {
    const loc = getReportLocation(ctx, info);
    if (!hasMapPin(loc)) continue;
    cache.delete(weatherKey(loc.lat, loc.lng, date));
    missReasons.delete(weatherKey(loc.lat, loc.lng, date));
    await fetchSunWeatherBatch(loc, [date], collectedWeather);
    if (!loc.place) {
      addressCache.delete(labelKey(loc.lat, loc.lng));
      await reverseGeocodeAddress(loc.lat, loc.lng, collectedLabels);
    }
  }
  mergeSunWeatherStore(ctx.project.id, collectedWeather, collectedLabels);
}

export interface DaySunWeatherView {
  /** False when the day has no location pin — nothing to look up. A manual
   *  override still supplies `entry` without a pin. */
  hasPin: boolean;
  /** undefined = not warmed yet this session · null = a known miss. */
  entry: StoredSunWeather | null | undefined;
  miss: WeatherMissReason | undefined;
  /** True when the day's manual override (roadmap 301) supplies the values. */
  manual: boolean;
}

// ---- manual override (roadmap 301) -------------------------------------------
// Typed weather lives on the governing daybreak's `daybreakMeta.weatherOverride`.
// THIS is the one read path: the Day Manager chip/Details and every report
// weather field resolve through it; a blank field falls back to the fetched
// value so a partial override never blanks the rest.

/** Merge the manual fields over the fetched entry (blank = API value). */
function overrideEntry(
  ov: DayWeatherOverride,
  base: StoredSunWeather | null | undefined,
): StoredSunWeather {
  return {
    sunrise: (ov.sunrise || '').trim() || base?.sunrise || '',
    sunset: (ov.sunset || '').trim() || base?.sunset || '',
    weather: (ov.weather || '').trim() || base?.weather || '',
    tempMin: ov.tempMin ?? base?.tempMin ?? null,
    tempMax: ov.tempMax ?? base?.tempMax ?? null,
    code: base?.code ?? null,
    at: base?.at ?? Date.now(),
  };
}

/** The day override that applies to a weather field, or undefined. The
 *  override is day-scoped: it only wins for the day item itself or a location
 *  item pinned at the day's own location — never a location-table row pointing
 *  at another pin, and never an explicit `locationChoice` pick. */
function dayOverrideFor(
  ctx: ReportCtx,
  item: any,
  aux: { dayDate?: string; locationChoice?: string } | undefined,
  date: string,
): DayWeatherOverride | undefined {
  if (aux?.locationChoice) return undefined;
  const info = ctx.dayInfos?.find(d => d.date === date);
  const ov = info?.weatherOverride;
  if (!info || !ov?.enabled) return undefined;
  if (item === info) return ov;
  const loc = pickLocation(ctx, item, aux?.locationChoice);
  if (!loc) return undefined;
  const dayLoc = getReportLocation(ctx, info);
  if (!hasMapPin(dayLoc)) return undefined;
  return weatherKey(loc.lat, loc.lng, date) === weatherKey(dayLoc.lat, dayLoc.lng, date)
    ? ov
    : undefined;
}

/** The selected day's sun/weather state for the Day Manager chip + Details
 *  (roadmaps 298/301) — the manual override, else the day-seam location's
 *  values, else the no-pin/miss state. */
export function daySunWeather(ctx: ReportCtx, date: string): DaySunWeatherView {
  const info = ctx.dayInfos?.find(d => d.date === date);
  if (!info) return { hasPin: false, entry: undefined, miss: undefined, manual: false };
  const loc = getReportLocation(ctx, info);
  const hasPin = hasMapPin(loc);
  if (info.weatherOverride?.enabled) {
    const base = hasPin ? getCachedSunWeather(loc, date) : undefined;
    return { hasPin, entry: overrideEntry(info.weatherOverride, base), miss: undefined, manual: true };
  }
  if (!hasPin) return { hasPin: false, entry: undefined, miss: undefined, manual: false };
  const entry = getCachedSunWeather(loc, date);
  return { hasPin: true, entry, miss: entry === null ? getSunWeatherMiss(loc, date) : undefined, manual: false };
}

export async function prepareSunWeatherForDesign(project: Project, version: ScheduleVersion, calendarVersion: CalendarVersion, daybreak: ReportDaybreakData, design?: ReportDesign): Promise<void> {
  const ctx = buildReportCtx(project, version, calendarVersion, daybreak);
  await prepareSunWeatherForCtx(ctx, design);
}

/** "24°C" — em dash when the API returned no temperature. */
export function formatTempC(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)}°C`;
}

/** Field get(): sun/weather for the resolved location on the in-scope day —
 *  a day item uses its own date; a location item uses the nearest day
 *  ancestor's date. Empty when no day is in scope or the data isn't cached
 *  (canvas before a prefetch) or the fetch failed. */
export function sunWeatherFieldValue(
  ctx: ReportCtx,
  item: any,
  aux: { dayDate?: string; locationChoice?: string } | undefined,
  kind: 'sunrise' | 'sunset' | 'weather' | 'tempHigh' | 'tempLow',
): string {
  const date = aux?.dayDate || (item?.date as string | undefined);
  if (!date) return '—';
  const loc = pickLocation(ctx, item, aux?.locationChoice);
  const override = dayOverrideFor(ctx, item, aux, date);
  const w = override
    ? overrideEntry(override, loc && hasMapPin(loc) ? getCachedSunWeather(loc, date) : undefined)
    : loc ? getCachedSunWeather(loc, date) : undefined;
  if (!w) {
    // A resolved miss (not the pre-fetch undefined, which stays a dash until
    // the canvas/preview warms): a date past the forecast horizon gets a short
    // hint instead of a bare dash. Fetch errors stay quiet.
    if (w === null && loc && getSunWeatherMiss(loc, date) === 'too-far') return 'No forecast yet';
    return '—';
  }
  if (kind === 'weather') return formatWeatherValue(w) || '—';
  if (kind === 'tempHigh') return formatTempC(w.tempMax);
  if (kind === 'tempLow') return formatTempC(w.tempMin);
  return w[kind] || '—';
}
