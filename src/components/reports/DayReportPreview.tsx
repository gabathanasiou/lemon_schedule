import React, { useEffect, useMemo, useState } from 'react';
import { ReportDesign } from '../../types';
import { useProject } from '../../store';
import { useReportCtx } from '../../lib/useReportCtx';
import { getReportFieldMap } from '../../lib/reportFields';
import { prepareSunWeatherForCtx } from '../../lib/reportWeather';
import type { ReportScopeFilter } from '../../lib/reportData';
import ReportPreview from './ReportPreview';

/**
 * Shared day-scoped report host (items 98/10). Renders the REAL report design
 * limited to one production day via `ReportScopeFilter` — the same host powers
 * the Day Manager's live preview pane and the call-sheet print flow. Built on
 * the canonical `useReportCtx` + `ReportPreview`, so it never re-derives.
 */
export interface DayReportPreviewProps {
  design: ReportDesign;
  /** Section index of the production day (the reports' `days` item key). */
  sectionIndex: number;
  embedded?: boolean;
  onExit: () => void;
}

export function dayScopeFilter(sectionIndex: number): ReportScopeFilter {
  return { scopes: [{ collection: 'days', include: [sectionIndex] }] };
}

const DayReportPreview: React.FC<DayReportPreviewProps> = ({ design, sectionIndex, embedded, onExit }) => {
  const { state } = useProject();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const scopeFilter = useMemo(() => dayScopeFilter(sectionIndex), [sectionIndex]);

  // Warm sun/weather for the day's resolved location, then remount the preview
  // so the cached values render (the fetch is async and the paginator memoizes).
  const [weatherTick, setWeatherTick] = useState(0);
  useEffect(() => {
    if (!ctx) return;
    let alive = true;
    prepareSunWeatherForCtx(ctx, design)
      .then(() => { if (alive) setWeatherTick(t => t + 1); })
      .catch(() => {});
    return () => { alive = false; };
  }, [ctx, design]);

  if (!ctx) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-100 text-xs text-zinc-400">
        Loading report…
      </div>
    );
  }

  return (
    <ReportPreview
      key={weatherTick}
      design={design}
      ctx={ctx}
      fieldMap={fieldMap}
      scopeFilter={scopeFilter}
      onExit={onExit}
      embedded={embedded}
    />
  );
};

export default DayReportPreview;
