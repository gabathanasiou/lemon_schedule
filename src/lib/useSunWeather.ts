import { useCallback, useEffect, useState } from 'react';
import { prepareSunWeatherForCtx, refreshSunWeatherForCtx } from './reportWeather';
import type { ReportCtx } from './reportData';
import type { ReportDesign } from '../types';

/**
 * ONE warm/refresh seam for every weather-rendering surface (roadmap 299):
 * prefetch per the storage policy on (re)mount, then bump a tick so memoized
 * blocks re-render with the cached values (without it the canvas shows "—"
 * for weather/sunrise/sunset). `refresh(date)` bypasses the freshness policy
 * for one day — the Day Manager chip's force-update.
 */
export function useSunWeather(ctx: ReportCtx | null, design?: ReportDesign) {
  const [weatherTick, setWeatherTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!ctx) return;
    let alive = true;
    prepareSunWeatherForCtx(ctx, design)
      .then(() => { if (alive) setWeatherTick(t => t + 1); })
      .catch(() => {});
    return () => { alive = false; };
  }, [ctx, design]);

  const refresh = useCallback(async (date: string) => {
    if (!ctx) return;
    setRefreshing(true);
    try {
      await refreshSunWeatherForCtx(ctx, date);
    } catch { /* best-effort — the stored values stay visible */ }
    setRefreshing(false);
    setWeatherTick(t => t + 1);
  }, [ctx]);

  return { weatherTick, refresh, refreshing };
}
