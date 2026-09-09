import React, { useMemo } from 'react';
import { useProject } from '../../../store';
import { useReportCtx } from '../../../lib/useReportCtx';
import { getReportFieldMap } from '../../../lib/reportFields';
import type { ReportBlock, ReportDesign, DayMeta } from '../../../types';
import { makeReportBlock } from '../../../lib/reportBlocks';
import { REPORT_PAGE_METRICS, REPORT_PAGE_PADDING } from '../../reports/reportStyle';
import { ReportBlockView } from '../../reports/ReportBlockView';
import ReportPalette from '../../reports/ReportPalette';
import CallSheetZoneDesigner from './CallSheetZoneDesigner';
import InteractiveGridBlock from './InteractiveGridBlock';
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
}

const CallSheetCanvas: React.FC<CallSheetCanvasProps> = ({ design, day, zoneBlocks, onChangeZone, patchMeta, onEditCallTimesSettings, readOnly }) => {
  const { state } = useProject();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);

  const dayItem = ctx?.dayInfos.find(d => d.section.index === day.sectionIndex);
  const dayBlocks = useMemo(() => callSheetDayBlocks(design), [design]);
  const metrics = REPORT_PAGE_METRICS[design.page];

  const readOnlyView = (b: ReportBlock, i: number, item?: any, parentCollection?: string) => (
    <div key={b.id} style={{ marginTop: i === 0 ? 0 : 6 }}>
      <ReportBlockView block={b} ctx={ctx!} fieldMap={fieldMap} item={item} parentCollection={parentCollection as any} />
    </div>
  );

  return (
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
                        <InteractiveGridBlock block={b} day={day} project={project} patchMeta={patchMeta} readOnly={readOnly} onEditCallTimesSettings={onEditCallTimesSettings} />
                      </div>
                    );
                  }
                  if (b.type === 'callSheetEdit') {
                    return (
                      <div key={b.id} className="my-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 px-1 pb-1">
                          Call Sheet Zone — editable for this day
                        </div>
                        <div className="rounded-lg border-2 border-dashed border-sky-300 p-2" style={{ background: '#f4f9ff' }}>
                          <CallSheetZoneDesigner
                            blocks={zoneBlocks}
                            onChange={onChangeZone}
                            readOnly={readOnly}
                            ctx={ctx}
                            pageSize={design.page}
                          />
                        </div>
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
  );
};

export default CallSheetCanvas;
