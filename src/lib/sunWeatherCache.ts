// Device-local sun/weather + reverse-geocode label memory (roadmap 299).
//
// Fetched values persist per PROJECT so settled history (past dates) is never
// re-asked and recent values survive a reload. Deliberately NOT project state:
// a dispatched write would land in the undo history (every action pushes
// `past`) and, in rooms, mint a per-user undo unit — the cache write would
// occupy the slot the next Ctrl+Z should hit. It is per-device derived data,
// the same school as item 233's per-user prefs. The key rides the provider's
// `lemon_schedule_*` sweep (src/store/provider.tsx), so deleting a project
// clears its cache automatically.
//
// Policy, the ONE place:
//  - missing entry            → fetch;
//  - PAST date                → stored is final (an explicit refresh re-pulls);
//  - today / upcoming         → refetch when older than STALE_MS;
//  - failures + "no forecast" → session memory only (never stored).
//
// Node tests run without localStorage: all IO here is a safe no-op, so the
// pure policy stays unit-testable.

const KEY_PREFIX = 'lemon_schedule_weather_v1_';

/** Upcoming-day entries older than this refetch on the next view/print. */
export const STALE_MS = 6 * 60 * 60 * 1000;

/** Entries older than this prune on load — this is a lookup memory, not an
 *  archive; a re-opened older project just re-pulls from the API. */
const MAX_AGE_MS = 730 * 24 * 60 * 60 * 1000;

export interface StoredSunWeather {
  sunrise: string;
  sunset: string;
  weather: string;
  tempMin: number | null;
  tempMax: number | null;
  /** Epoch ms of the fetch — drives the staleness window. */
  at: number;
}

export interface StoredLabel {
  label: string;
  at: number;
}

export interface SunWeatherStore {
  weather: Record<string, StoredSunWeather>;
  labels: Record<string, StoredLabel>;
}

export function weatherKey(lat: number, lng: number, date: string): string {
  return `${lat.toFixed(4)}|${lng.toFixed(4)}|${date}`;
}

export function labelKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)}|${lng.toFixed(4)}`;
}

/** Past dates are settled — stored values never auto-refetch. */
export function isPastDate(date: string, now = new Date()): boolean {
  return date < now.toISOString().slice(0, 10);
}

/** True when a stored (present) entry should be refetched despite existing. */
export function needsRefetch(entry: StoredSunWeather, date: string, nowMs = Date.now()): boolean {
  if (isPastDate(date, new Date(nowMs))) return false;
  return nowMs - entry.at >= STALE_MS;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Drop entries past MAX_AGE_MS (weather by its own date, labels by fetch). */
function prune(store: SunWeatherStore, nowMs: number): SunWeatherStore {
  const cutoffDate = new Date(nowMs - MAX_AGE_MS).toISOString().slice(0, 10);
  const weather: Record<string, StoredSunWeather> = {};
  for (const [key, entry] of Object.entries(store.weather)) {
    const date = key.slice(key.lastIndexOf('|') + 1);
    if (date >= cutoffDate) weather[key] = entry;
  }
  const labels: Record<string, StoredLabel> = {};
  for (const [key, entry] of Object.entries(store.labels)) {
    if (nowMs - entry.at < MAX_AGE_MS) labels[key] = entry;
  }
  return { weather, labels };
}

// Session memo — parse once per project; merges go through here so callers
// never read the same key twice.
const memo = new Map<string, SunWeatherStore>();

export function loadSunWeatherStore(projectId: string): SunWeatherStore {
  const hit = memo.get(projectId);
  if (hit) return hit;
  let parsed: SunWeatherStore = { weather: {}, labels: {} };
  const ls = storage();
  if (ls) {
    try {
      const raw = ls.getItem(KEY_PREFIX + projectId);
      if (raw) {
        const data = JSON.parse(raw);
        parsed = { weather: data?.weather || {}, labels: data?.labels || {} };
      }
    } catch { /* corrupt entry — start clean */ }
  }
  const pruned = prune(parsed, Date.now());
  memo.set(projectId, pruned);
  return pruned;
}

/** Merge freshly fetched values into the session store and persist. */
export function mergeSunWeatherStore(
  projectId: string,
  weather?: Record<string, StoredSunWeather>,
  labels?: Record<string, StoredLabel>,
): void {
  if (!(weather && Object.keys(weather).length) && !(labels && Object.keys(labels).length)) return;
  const store = loadSunWeatherStore(projectId);
  if (weather) Object.assign(store.weather, weather);
  if (labels) Object.assign(store.labels, labels);
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(KEY_PREFIX + projectId, JSON.stringify(store));
  } catch { /* quota — a cache is best-effort */ }
}
