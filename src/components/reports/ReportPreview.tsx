import React from 'react';
import { ReportDesign } from '../../types';
import { ReportCtx, ReportScopeFilter } from '../../lib/reportData';
import { ReportFieldDef } from '../../lib/reportFields';
import { ReportChunkPage } from './ReportBlockView';
import { REPORT_PAGE_METRICS, REPORT_PAGE_PADDING } from './reportStyle';
import { buildReportPages } from '../../lib/reportPagination';
import { useReportPaginator, ReportMeasureContainer } from './useReportPaginator';
import { X } from 'lucide-react';

// Paginated preview — pages mirror print pagination exactly (same measured
// chunks). A card's content box is the canonical page: contentWidth wide and
// contentHeight tall, with the same 14mm/12mm padding the print stylesheet
// applies via @page margins.

interface ReportPreviewProps {
  design: ReportDesign;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  scopeFilter?: ReportScopeFilter;
  onExit: () => void;
}

const ReportPreview: React.FC<ReportPreviewProps> = ({ design, ctx, fieldMap, scopeFilter, onExit }) => {
  const pages = React.useMemo(() => buildReportPages(design.blocks || [], ctx, scopeFilter), [design.blocks, ctx, scopeFilter]);
  const metrics = REPORT_PAGE_METRICS[design.page];
  const measureRef = React.useRef<HTMLDivElement>(null);
  const { chunks, measured } = useReportPaginator({
    measureRef,
    pages,
    headerBlocks: design.header,
    footerBlocks: design.footer,
    headerSkipFirst: design.headerSkipFirst,
    footerSkipFirst: design.footerSkipFirst,
    page: design.page,
    ctx,
    fieldMap,
    scopeFilter,
    previewLimit: true,
  });

  return (
    <div className="flex-1 overflow-auto bg-zinc-800 p-8">
      <div className="sticky top-0 z-20 flex justify-between mb-4 print:hidden">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white"
        >
          <X className="w-3.5 h-3.5" /> Exit Preview
        </button>
        <span className="text-xs text-zinc-500">Esc also exits · {chunks ? chunks.length : '…'} page{chunks && chunks.length !== 1 ? 's' : ''} · Print prints this view</span>
      </div>
      <div className="flex flex-col items-center gap-6" data-paginated={chunks ? 'true' : 'false'}>
        {chunks
          ? chunks.map((chunk, pi) => (
              <div
                key={pi}
                className="report-page mx-auto bg-white shadow-2xl relative"
                style={{ width: metrics.width, height: metrics.contentHeight + REPORT_PAGE_PADDING.v * 2, padding: `${REPORT_PAGE_PADDING.v}px ${REPORT_PAGE_PADDING.h}px`, display: 'flex', flexDirection: 'column' }}
              >
                {pi > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400">Page {pi + 1}</span>
                )}
                <ReportChunkPage
                  chunk={chunk}
                  ctx={ctx}
                  fieldMap={fieldMap}
                  scopeFilter={scopeFilter}
                  pageIndex={pi}
                  pageCount={chunks.length}
                  headerBlocks={design.header}
                  footerBlocks={design.footer}
                  previewLimit
                />
              </div>
            ))
          : (
            <div className="flex flex-col items-center gap-3 py-24 text-zinc-400">
              <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" aria-hidden />
              <span className="text-xs">Paginating…</span>
            </div>
          )}
      </div>
      {!measured && <ReportMeasureContainer ref={measureRef} pages={pages} headerBlocks={design.header} footerBlocks={design.footer} headerSkipFirst={design.headerSkipFirst} footerSkipFirst={design.footerSkipFirst} page={design.page} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} previewLimit />}
    </div>
  );
};

export default ReportPreview;