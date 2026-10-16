import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  STALE_MS, isPastDate, needsRefetch, weatherKey, labelKey,
  loadSunWeatherStore, mergeSunWeatherStore,
  type StoredSunWeather,
} from '../sunWeatherCache';

// In-memory localStorage stand-in — the module guards missing storage, but the
// persistence path (merge → parse, prune) deserves a real test.
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

const entry = (at: number): StoredSunWeather => ({
  sunrise: '07:00', sunset: '19:00', weather: 'Clear sky', tempMin: 10, tempMax: 20, at,
});

describe('sunWeatherCache policy', () => {
  it('treats dates before today as past — today itself is NOT settled', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    expect(isPastDate('2026-10-15', now)).toBe(true);
    expect(isPastDate('2026-10-16', now)).toBe(false);
    expect(isPastDate('2026-10-17', now)).toBe(false);
  });

  it('never refetches a past date, regardless of age', () => {
    const now = new Date('2026-10-16T12:00:00Z').getTime();
    expect(needsRefetch(entry(0), '2009-04-06', now)).toBe(false);
  });

  it('refetches an upcoming entry only after the 6 h window', () => {
    const now = Date.now();
    expect(needsRefetch(entry(now), '2099-01-01', now)).toBe(false);
    expect(needsRefetch(entry(now - STALE_MS + 1000), '2099-01-01', now)).toBe(false);
    expect(needsRefetch(entry(now - STALE_MS), '2099-01-01', now)).toBe(true);
  });

  it('keys weather by 4-decimal coordinates + date and labels by coordinates', () => {
    expect(weatherKey(51.5007042, -0.1245721, '2026-10-16')).toBe('51.5007|-0.1246|2026-10-16');
    expect(labelKey(51.5007042, -0.1245721)).toBe('51.5007|-0.1246');
  });
});

describe('sunWeatherCache store', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a safe no-op without localStorage (node tests)', () => {
    expect(loadSunWeatherStore('proj-none')).toEqual({ weather: {}, labels: {} });
    expect(() => mergeSunWeatherStore('proj-none', { [weatherKey(1, 2, '2026-01-01')]: entry(1) })).not.toThrow();
  });

  it('parses stored values on load and prunes entries beyond the age cap', () => {
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    const today = new Date().toISOString().slice(0, 10);
    ls.setItem('lemon_schedule_weather_v1_proj-parse', JSON.stringify({
      weather: {
        [weatherKey(1, 2, today)]: entry(Date.now()),
        [weatherKey(3, 4, '2001-01-01')]: entry(0), // ~decades old → pruned
      },
      labels: {
        [labelKey(1, 2)]: { label: 'Kept', at: Date.now() },
        [labelKey(3, 4)]: { label: 'Pruned', at: 0 },
      },
    }));

    const store = loadSunWeatherStore('proj-parse');
    expect(Object.keys(store.weather)).toEqual([weatherKey(1, 2, today)]);
    expect(Object.keys(store.labels)).toEqual([labelKey(1, 2)]);
    expect(store.weather[weatherKey(1, 2, today)].sunrise).toBe('07:00');
  });

  it('merges into the session store and round-trips through localStorage', () => {
    const ls = fakeStorage();
    vi.stubGlobal('localStorage', ls);
    const { weatherKey: wk, labelKey: lk } = { weatherKey, labelKey };
    mergeSunWeatherStore('proj-round', { [wk(9, 9, '2026-01-02')]: entry(5) }, { [lk(9, 9)]: { label: 'X', at: 5 } });
    const raw = ls.getItem('lemon_schedule_weather_v1_proj-round');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.weather[wk(9, 9, '2026-01-02')].sunset).toBe('19:00');
    expect(parsed.labels[lk(9, 9)].label).toBe('X');
  });
});
