import React from 'react';
import { CloudSun, Loader2, RefreshCw } from 'lucide-react';
import type { ReportCtx } from '../../../lib/reportData';
import { daySunWeather, formatWeatherValue } from '../../../lib/reportWeather';
import { isPastDate } from '../../../lib/sunWeatherCache';
import { useSunWeather } from '../../../lib/useSunWeather';

/**
 * Day weather chip (roadmap 299): the selected day's sun/weather for its
 * resolved location (the day-seam master → scene fallback) + a force-refresh.
 * Past days are settled — the automatic prefetch never re-asks the API for
 * them, so the refresh button is the explicit "re-check the record" escape
 * hatch; upcoming days refresh automatically after 6 h. Values seed from the
 * device-local store (sunWeatherCache.ts), so a reload shows them instantly.
 */
export const DayWeatherChip: React.FC<{ ctx: ReportCtx | null; date: string }> = ({ ctx, date }) => {
  // Warm per the storage policy + tick; `refresh` bypasses the policy for
  // this one date (archive re-pull for past days).
  const { refresh, refreshing } = useSunWeather(ctx);
  if (!ctx) return null;
  const info = daySunWeather(ctx, date);
  const past = isPastDate(date);

  if (!info.hasPin) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-400"
        title="No location pin for this day — set its master location (or pin a scene location) in Day Details."
      >
        <CloudSun className="w-3 h-3" />
        No location pin
      </span>
    );
  }

  const value = info.entry == null
    ? (info.miss === 'too-far' ? 'No forecast yet' : '—')
    : `${info.entry.sunrise}–${info.entry.sunset} · ${formatWeatherValue(info.entry)}`;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-0.5 pl-2 pr-0.5 text-[11px] text-zinc-600"
      title={past
        ? 'Stored weather for this past day — refresh re-checks the historical record.'
        : 'Latest forecast for this day — refreshes automatically after 6 h.'}
      data-presence-anchor="toolbar:days:weather"
    >
      <CloudSun className="w-3 h-3 text-zinc-400" />
      <span className="tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => { void refresh(date); }}
        disabled={refreshing || info.miss === 'too-far'}
        title={past ? 'Re-check this day’s historical weather' : 'Fetch the latest forecast'}
        aria-label="Refresh weather"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
      >
        {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
      </button>
    </span>
  );
};

export default DayWeatherChip;
