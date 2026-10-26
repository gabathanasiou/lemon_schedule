import React, { useMemo, useState } from 'react';
import { useProject } from '../../../store';
import { useReportCtx } from '../../../lib/useReportCtx';
import { getReportFieldMap } from '../../../lib/reportFields';
import { useSunWeather } from '../../../lib/useSunWeather';
import type { ReportBlock, ReportDesign, DayMeta, ReportViewMode } from '../../../types';
import { findDesignCallSheetZone, ribbonTimeOverrides } from '../../../lib/reportBlocks';
import type { RibbonPrintOptions } from '../../../lib/reportData';
import { REPORT_PAGE_METRICS, REPORT_PAGE_PADDING, CALL_SHEET_EDIT_ZONE_STYLE } from '../../reports/reportStyle';
import { ReportBlockView } from '../../reports/ReportBlockView';
import ReportBlockTitle from '../../reports/ReportBlockTitle';
import type { ReportZonePageArgs } from '../../reports/ReportDesigner';
import InteractiveGridBlock from './InteractiveGridBlock';
import { SceneHighlightContext } from '../../reports/sceneHighlight';
import type { DayView } from '../../../lib/dayView';

/**
 * WYSIWYG call-sheet PAGE (roadmap 10). The whole design renders on ONE white
 * page filled with the selected day's real data — the template's
 * scenes/crew/locations/etc. are read-only; the design's single
 * `callSheetEdit` zone slot hosts the REAL Reports Designer canvas, supplied by
 * the editor (`editor.canvas`, roadmap 212: `ReportDesigner` zone mode owns the
 * rail, chrome, guards and commit pipeline). Every call-sheet design renders
 * here: the zone slot is simply absent when the design has no `callSheetEdit`
 * (roadmap 211) — that page is display-only.
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
  /** Fields/Values display mode (roadmap 203/212) — chips on the read-only
   *  template in Fields mode. */
  mode?: ReportViewMode;
  /** Zone editor state (roadmap 212). Set only when the design HAS a
   *  `callSheetEdit` zone: `canvas` is the live bare Reports Designer canvas,
   *  positioned at the zone slot. Absent = display-only page (roadmap 211). */
  editor?: ReportZonePageArgs;
}

const CallSheetCanvas: React.FC<CallSheetCanvasProps> = ({
  design, day, zoneBlocks, patchMeta, onEditCallTimesSettings, readOnly,
  showRibbonTimes, openAddCrewMember, mode, editor,
}) => {
  const { state } = useProject();
  const project = state.present;
  const ownCtx = useReportCtx();
  const ctx = editor?.ctx ?? ownCtx;
  const fieldMap = useMemo(() => editor?.fieldMap ?? getReportFieldMap(project), [editor?.fieldMap, project]);

  const dayItem = ctx?.dayInfos.find(d => d.section.index === day.sectionIndex);
  const dayBlocks = useMemo(() => callSheetPageBlocks(design), [design]);
  const metrics = REPORT_PAGE_METRICS[design.page];
  // The ONE editable zone (roadmap 212): the page swaps exactly this block for
  // the live canvas; any other zone renders the day's content read-only, like
  // print (a legacy design with two zones must not mount two editors).
  const zoneId = useMemo(() => findDesignCallSheetZone(design)?.id, [design]);
  // Hovered element row's first scene (item 115) → the ribbon's strip highlights.
  const [highlightScene, setHighlightScene] = useState<string | null>(null);

  // Warm sun/weather for the day's resolved location (roadmap 299) — ticks so
  // the memoized template blocks re-render with the cached values. The zone
  // canvas reads values from the same cached store.
  const { weatherTick } = useSunWeather(ctx, design);

  // Item 114 — view-only ribbon overrides: force call times + durations on
  // every ribbon block in the design, preserving each block's other flags. Off
  // = render the design exactly as stored. (The zone canvas gets the same
  // override through the editor — roadmap 212.)
  const ribbonOverrides = useMemo(
    () => (showRibbonTimes ? ribbonTimeOverrides([...(design.header || []), ...(design.blocks || []), ...(design.footer || [])]) : undefined),
    [design, showRibbonTimes],
  );

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
      <ReportBlockView block={b} ctx={ctx!} fieldMap={fieldMap} item={item} parentCollection={parentCollection as any} mode={mode} aux={{ callSheetBlocks: zoneBlocks }} ribbonOverrides={ribbonOverrides} />
    </div>
  );

  // The zone is honored WHEREVER it sits (item 213): a direct header/footer
  // child swaps to the live canvas; a `days` repeat there dissolves to the
  // selected day's content (matching print). Every other block stays
  // read-only — only the zone writes `daybreakMeta.callSheets[designId]`.
  const zoneSlot = (b: ReportBlock) => (
    <div key={b.id} className="my-3" style={CALL_SHEET_EDIT_ZONE_STYLE}>
      {editor!.canvas}
    </div>
  );
  const isEditableZone = (b: ReportBlock) => b.id === zoneId && !!editor;

  const renderTemplateRegion = (blocks: ReportBlock[]) =>
    blocks.map((b, i) => {
      if (b.type === 'callSheetEdit') return isEditableZone(b) ? zoneSlot(b) : readOnlyView(b, i, dayItem, 'days');
      if (b.type === 'repeat' && b.collection === 'days') {
        return (
          <React.Fragment key={b.id}>
            {(b.children || []).map((c, ci) =>
              c.type === 'pageBreak' ? null
                : c.type === 'callSheetEdit' ? (isEditableZone(c) ? zoneSlot(c) : readOnlyView(c, ci, dayItem, 'days'))
                  : readOnlyView(c, ci, dayItem, 'days'))}
          </React.Fragment>
        );
      }
      return readOnlyView(b, i);
    });

  return (
    <SceneHighlightContext.Provider value={highlightScene}>
      <div className="flex-1 min-h-0 min-w-0 overflow-auto p-6 bg-zinc-950 text-zinc-300 select-none" data-call-sheet-canvas>
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
                  return isEditableZone(b) ? zoneSlot(b) : readOnlyView(b, i, dayItem, 'days');
                }
                return readOnlyView(b, i, dayItem, 'days');
              })}
              {renderTemplateRegion(design.footer || [])}
            </>
          )}
        </div>
      </div>
    </SceneHighlightContext.Provider>
  );
};

export default CallSheetCanvas;
