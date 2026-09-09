import React, { useEffect, useMemo, useState } from 'react';
import { useProject } from '../../../store';
import { useReportCtx } from '../../../lib/useReportCtx';
import { getReportFieldMap } from '../../../lib/reportFields';
import { prepareSunWeatherForCtx } from '../../../lib/reportWeather';
import type { ReportBlock, ReportDesign, DayMeta } from '../../../types';
import { makeReportBlock, collectRibbonBlocks } from '../../../lib/reportBlocks';
import type { RibbonPrintOptions } from '../../../lib/reportData';
import { REPORT_PAGE_METRICS, REPORT_PAGE_PADDING, CALL_SHEET_EDIT_ZONE_STYLE } from '../../reports/reportStyle';
import { ReportBlockView } from '../../reports/ReportBlockView';
import ReportPalette from '../../reports/ReportPalette';
import CallSheetZoneDesigner from './CallSheetZoneDesigner';
import InteractiveGridBlock from './InteractiveGridBlock';
import { SceneHighlightContext } from '../../reports/sceneHighlight';
import type { DayView } from '../../../lib/dayView';

/**
 * WYSIWYG call-sheet editor (roadmap 10). The whole design renders on ONE
 * white page, filled with the selected day's real data — the template's
 * scenes/crew/locations/etc. are read-only. At the `callSheetEdit` zone slot
 * the REAL reports-designer canvas is embedded (drag & drop from the palette,
 * drop zones, floating block chrome, right-click menus) editing the day's
 * zone content only. Works on the shape `days` repeat → (…, callSheetEdit, …).
 */
export function callSheetDayBlocks(design: ReportDesign): ReportBlock[] | null {
  for (const b of design.blocks || []) {
    if (b.type === 'repeat' && b.collection === 'days' && (b.children || []).some(c => c.type === 'callSheetEdit')) {
      return b.children || [];
    }
  }
  return null;
}

interface CallSheetCanvasProps {
  design: ReportDesign;
  day: DayView;
  zoneBlocks: ReportBlock[];
  onChangeZone: (blocks: ReportBlock[]) => void;
  /** Writes day properties for the selected day (`daybreakMeta`). */
  patchMeta: (patch: Partial<DayMeta>) => void;
  /** Header right-click on a live grid → "Edit Call Time Stages…". */
  onEditCallTimesSettings?: () => void;
  readOnly?: boolean;
  /** Design-time aid (item 114): force call times + durations visible in every
   *  ribbon block on this canvas. Never saved, never printed. */
  showRibbonTimes?: boolean;
}

const CallSheetCanvas: React.FC<CallSheetCanvasProps> = ({ design, day, zoneBlocks, onChangeZone, patchMeta, onEditCallTimesSettings, readOnly, showRibbonTimes }) => {
  const { state } = useProject();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);

  const dayItem = ctx?.dayInfos.find(d => d.section.index === day.sectionIndex);
  const dayBlocks = useMemo(() => callSheetDayBlocks(design), [design]);
  const metrics = REPORT_PAGE_METRICS[design.page];
  // Hovered element row's first scene (item 115) → the ribbon's strip highlights.
  const [highlightScene, setHighlightScene] = useState<string | null>(null);

  // Warm sun/weather for the day's resolved location, then bump a tick so the
  // (memoized) template blocks re-render with the cached values — without it
  // the editor shows "—" for weather/sunrise/sunset (the preview warms it too).
  const [weatherTick, setWeatherTick] = useState(0);
  useEffect(() => {
    if (!ctx) return;
    let alive = true;
    prepareSunWeatherForCtx(ctx, design)
      .then(() => { if (alive) setWeatherTick(t => t + 1); })
      .catch(() => {});
    return () => { alive = false; };
  }, [ctx, design]);

  // Item 114 — view-only ribbon overrides: when the toggle is on, force call
  // times + durations visible on every ribbon block in the design, preserving
  // each block's other flags. Off = render the design exactly as stored.
  const ribbonOverrides = useMemo(() => {
    if (!showRibbonTimes) return undefined;
    const map: Record<string, RibbonPrintOptions> = {};
    for (const b of collectRibbonBlocks([...(design.header || []), ...(design.blocks || []), ...(design.footer || [])])) {
      map[b.id] = {
        ribbonId: b.ribbonId,
        showCallTimes: true,
        showDurations: true,
        showNotes: b.ribbonNotes !== false,
        showBreaks: b.ribbonBreaks === true,
        showDayBreaks: b.ribbonDayBreaks === true || b.ribbonHeaders === true,
      };
    }
    return map;
  }, [design, showRibbonTimes]);

  const readOnlyView = (b: ReportBlock, i: number, item?: any, parentCollection?: string) => (
    <div key={`${b.id}:${weatherTick}`} style={{ marginTop: i === 0 ? 0 : 6 }}>
      <ReportBlockView block={b} ctx={ctx!} fieldMap={fieldMap} item={item} parentCollection={parentCollection as any} ribbonOverrides={ribbonOverrides} />
    </div>
  );

  return (
    <SceneHighlightContext.Provider value={highlightScene}>
    <div className="flex-1 flex min-h-0 min-w-0 bg-zinc-950 text-zinc-300 select-none" data-call-sheet-canvas>
      <ReportPalette project={project} insertScope="days" insideColumns={false} readOnly={!!readOnly} onInsert={payload => {
        const b = (payload as { field?: string }).field
          ? makeReportBlock('text', { text: `{{${(payload as { field?: string }).field}}}` })
          : makeReportBlock((payload.type || 'text') as ReportBlock['type']);
        onChangeZone([...zoneBlocks, b]);
      }} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex-1 overflow-auto p-6">
          <div
            className="mx-auto bg-white shadow-2xl"
            style={{ width: metrics.contentWidth, padding: `${REPORT_PAGE_PADDING.v}px ${REPORT_PAGE_PADDING.h}px` }}
            data-call-sheet-page
          >
            {!ctx || !dayItem ? (
              <div className="py-16 text-center text-xs text-zinc-400">Loading day…</div>
            ) : (
              <>
                {(design.header || []).map((b, i) => readOnlyView(b, i))}
                {(dayBlocks || []).map((b, i) => {
                  if (b.type === 'pageBreak') return null;
                  if (b.type === 'callTimes' || b.type === 'crewTable') {
                    return (
                      <div key={b.id} className="my-3">
                        <InteractiveGridBlock block={b} day={day} project={project} patchMeta={patchMeta} readOnly={readOnly} onEditCallTimesSettings={onEditCallTimesSettings} onHighlightScene={setHighlightScene} />
                      </div>
                    );
                  }
                  if (b.type === 'callSheetEdit') {
                    return (
                      <div key={b.id} className="my-3" style={CALL_SHEET_EDIT_ZONE_STYLE}>
                        <CallSheetZoneDesigner
                          blocks={zoneBlocks}
                          onChange={onChangeZone}
                          readOnly={readOnly}
                          ctx={ctx}
                          pageSize={design.page}
                          dayItem={dayItem}
                        />
                      </div>
                    );
                  }
                  return readOnlyView(b, i, dayItem, 'days');
                })}
                {(design.footer || []).map((b, i) => readOnlyView(b, i))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </SceneHighlightContext.Provider>
  );
};

export default CallSheetCanvas;
