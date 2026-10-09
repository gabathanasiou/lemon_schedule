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
import ReportBlockTitle from '../../reports/ReportBlockTitle';
import ReportPalette from '../../reports/ReportPalette';
import CallSheetZoneDesigner from './CallSheetZoneDesigner';
import InteractiveGridBlock from './InteractiveGridBlock';
import { useCallSheetGridGuard } from './useCallSheetGridGuard';
import { SceneHighlightContext } from '../../reports/sceneHighlight';
import type { DayView } from '../../../lib/dayView';

/**
 * WYSIWYG call-sheet editor (roadmap 10). The whole design renders on ONE
 * white page, filled with the selected day's real data — the template's
 * scenes/crew/locations/etc. are read-only. At the `callSheetEdit` zone slot
 * the REAL reports-designer canvas is embedded (drag & drop from the palette,
 * drop zones, floating block chrome, right-click menus) editing the day's
 * zone content only. Every call-sheet design renders here: the zone slot is
 * simply absent when the design has no `callSheetEdit` (roadmap 211).
 */
export function callSheetDayBlocks(design: ReportDesign): ReportBlock[] | null {
  // BODY only on purpose: a zone-bearing days repeat in header/footer renders
  // in place via `renderTemplateRegion`, so returning its children here would
  // duplicate the day content in the body (item 213).
  for (const b of design.blocks || []) {
    if (b.type === 'repeat' && b.collection === 'days' && (b.children || []).some(c => c.type === 'callSheetEdit')) {
      return b.children || [];
    }
  }
  return null;
}

/** The body blocks this page renders for the day: the zone-bearing days
 *  repeat's children when present, else a plain days repeat's children, else
 *  the design body itself — so zone-less designs display the same page instead
 *  of nothing (roadmap 211). */
export function callSheetPageBlocks(design: ReportDesign): ReportBlock[] {
  const withZone = callSheetDayBlocks(design);
  if (withZone) return withZone;
  for (const b of design.blocks || []) {
    if (b.type === 'repeat' && b.collection === 'days') return b.children || [];
  }
  return design.blocks || [];
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
  /** Item 146 — the shared Add Crew Member modal (crew table person swap /
   *  Add role flows); owned by the Day Manager composition root. */
  openAddCrewMember?: (opts?: { role?: string; name?: string; slotId?: string }) => void;
}

const CallSheetCanvas: React.FC<CallSheetCanvasProps> = ({ design, day, zoneBlocks, onChangeZone, patchMeta, onEditCallTimesSettings, readOnly, showRibbonTimes, openAddCrewMember }) => {
  const { state } = useProject();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const guardGridInsert = useCallSheetGridGuard();

  const dayItem = ctx?.dayInfos.find(d => d.section.index === day.sectionIndex);
  const dayBlocks = useMemo(() => callSheetPageBlocks(design), [design]);
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

  // The design's own block title (item 140) for a live grid — the ONE
  // `ReportBlockTitle` renderer, resolved against the selected day like the
  // surrounding read-only template (item 222).
  const gridTitle = (b: ReportBlock) => (
    <ReportBlockTitle
      block={b}
      ctx={ctx!}
      fieldMap={fieldMap}
      item={dayItem}
      parentCollection="days"
      aux={{ callSheetBlocks: zoneBlocks }}
    />
  );

  const readOnlyView = (b: ReportBlock, i: number, item?: any, parentCollection?: string) => (
    <div key={`${b.id}:${weatherTick}`} style={{ marginTop: i === 0 ? 0 : 6 }}>
      <ReportBlockView block={b} ctx={ctx!} fieldMap={fieldMap} item={item} parentCollection={parentCollection as any} aux={{ callSheetBlocks: zoneBlocks }} ribbonOverrides={ribbonOverrides} />
    </div>
  );

  // The zone is honored WHEREVER it sits (item 213): a direct header/footer
  // child swaps to the editable zone slot; a `days` repeat there dissolves to
  // the selected day's content (matching print/preview). Every other block
  // stays read-only — only `callSheetEdit` is per-day content.
  const zoneSlot = (b: ReportBlock) => (
    <div key={b.id} className="my-3" style={CALL_SHEET_EDIT_ZONE_STYLE}>
      <CallSheetZoneDesigner
        blocks={zoneBlocks}
        onChange={onChangeZone}
        readOnly={readOnly}
        ctx={ctx!}
        pageSize={design.page}
        dayItem={dayItem}
      />
    </div>
  );

  const renderTemplateRegion = (blocks: ReportBlock[]) =>
    blocks.map((b, i) => {
      if (b.type === 'callSheetEdit') return zoneSlot(b);
      if (b.type === 'repeat' && b.collection === 'days') {
        return (
          <React.Fragment key={b.id}>
            {(b.children || []).map((c, ci) =>
              c.type === 'pageBreak' ? null
                : c.type === 'callSheetEdit' ? zoneSlot(c)
                  : readOnlyView(c, ci, dayItem, 'days'))}
          </React.Fragment>
        );
      }
      return readOnlyView(b, i);
    });

  return (
    <SceneHighlightContext.Provider value={highlightScene}>
    <div className="flex-1 flex min-h-0 min-w-0 bg-zinc-950 text-zinc-300 select-none" data-call-sheet-canvas>
      <ReportPalette project={project} insertScope="days" readOnly={!!readOnly} onInsert={payload => {
        if (!guardGridInsert(payload)) return;
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
                {renderTemplateRegion(design.header || [])}
                {(dayBlocks || []).map((b, i) => {
                  if (b.type === 'pageBreak') return null;
                  if (b.type === 'callTimes' || b.type === 'crewTable' || b.type === 'precalls') {
                    return (
                      <div key={b.id} className="my-3">
                        <InteractiveGridBlock block={b} day={day} project={project} patchMeta={patchMeta} readOnly={readOnly} onEditCallTimesSettings={onEditCallTimesSettings} onHighlightScene={setHighlightScene} showTimes={showRibbonTimes} openAddCrewMember={openAddCrewMember} title={gridTitle(b)} />
                      </div>
                    );
                  }
                  if (b.type === 'callSheetEdit') {
                    return zoneSlot(b);
                  }
                  return readOnlyView(b, i, dayItem, 'days');
                })}
                {renderTemplateRegion(design.footer || [])}
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
