import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { DaySunWeatherView } from '../../../lib/reportWeather';
import { formatWeatherValue } from '../../../lib/reportWeather';
import { isPastDate } from '../../../lib/sunWeatherCache';
import { wmoIcon } from './weatherIcon';

/**
 * Day weather chip (roadmap 299, manual override 301): the selected day's
 * sun/weather for its resolved location (the day-seam master → scene fallback)
 * + a force-refresh. Values seed from the device-local store
 * (sunWeatherCache.ts), so a reload shows them instantly. A manual override
 * (Day Details) wins and hides refresh — there is nothing to re-fetch.
 */
export interface DayWeatherChipProps {
  view: DaySunWeatherView | null;
  date: string;
  refresh: (date: string) => void;
  refreshing: boolean;
}

/** "05:44–20:25 · Partly cloudy · 18–24°C" with empty parts dropped. */
function chipLabel(view: DaySunWeatherView): string {
  const entry = view.entry;
  if (!entry) return view.miss === 'too-far' ? 'No forecast yet' : '—';
  const parts: string[] = [];
  if (entry.sunrise || entry.sunset) parts.push(`${entry.sunrise || '—'}–${entry.sunset || '—'}`);
  const weather = formatWeatherValue(entry);
  if (weather) parts.push(weather);
  return parts.join(' · ') || '—';
}

export const DayWeatherChip: React.FC<DayWeatherChipProps> = ({ view, date, refresh, refreshing }) => {
  if (!view) return null;

  if (!view.hasPin && !view.manual) {
    const NoPinIcon = wmoIcon();
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-400"
        title="No location pin for this day — set its master location (or pin a scene location) in Day Details."
      >
        <NoPinIcon className="w-3 h-3" />
        No location pin
      </span>
    );
  }

  const Icon = wmoIcon(view.entry?.code);
  const past = isPastDate(date);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-0.5 pl-2 pr-0.5 text-[11px] text-zinc-600"
      title={view.manual
        ? 'Manual weather — entered in Day Details; the API value is not shown.'
        : past
          ? 'Stored weather for this past day — refresh re-checks the historical record.'
          : 'Latest forecast for this day — refreshes automatically after 6 h.'}
      data-presence-anchor="toolbar:days:weather"
    >
      <Icon className="w-3 h-3 text-zinc-400" />
      <span className="tabular-nums">{chipLabel(view)}</span>
      {view.manual && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400" title="Entered manually in Day Details">
          Manual
        </span>
      )}
      {!view.manual && (
        <button
          type="button"
          onClick={() => { void refresh(date); }}
          disabled={refreshing || view.miss === 'too-far'}
          title={past ? 'Re-check this day’s historical weather' : 'Fetch the latest forecast'}
          aria-label="Refresh weather"
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
        >
          {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </button>
      )}
    </span>
  );
};

export default DayWeatherChip;
