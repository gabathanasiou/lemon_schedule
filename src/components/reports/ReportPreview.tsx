import React from 'react';
import { ReportDesign } from '../../types';
import { ReportCtx, ReportScopeFilter } from '../../lib/reportData';
import { ReportFieldDef } from '../../lib/reportFields';
import { ReportPageItems } from './ReportBlockView';
import { REPORT_PAGE_WIDTHS } from './reportStyle';
import { buildReportPages } from '../../lib/reportPagination';
import { X } from 'lucide-react';

// Paginated preview — pages mirror print pagination exactly (top-level page
// breaks AND per-item repeat breaks each start a new sheet).

interface ReportPreviewProps {
  design: ReportDesign;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  scopeFilter?: ReportScopeFilter;
  onExit: () => void;
}

const ReportPreview: React.FC<ReportPreviewProps> = ({ design, ctx, fieldMap, scopeFilter, onExit }) => {
  const pages = React.useMemo(() => buildReportPages(design.blocks || [], ctx, scopeFilter), [design.blocks, ctx, scopeFilter]);
  const pageW = REPORT_PAGE_WIDTHS[design.page];

  return (
    <div className="flex-1 overflow-auto bg-zinc-800 p-8">
      <div className="sticky top-0 z-20 flex justify-between mb-4 print:hidden">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white"
        >
          <X className="w-3.5 h-3.5" /> Exit Preview
        </button>
        <span className="text-xs text-zinc-500">Esc also exits · {pages.length} page{pages.length !== 1 ? 's' : ''} · Print prints this view</span>
      </div>
      <div className="flex flex-col items-center gap-6">
        {pages.map((blocks, pi) => (
          <div
            key={pi}
            className="mx-auto bg-white shadow-2xl relative"
            style={{ width: pageW, minHeight: pageW * 1.414, padding: '14mm 12mm', display: 'flex', flexDirection: 'column' }}
          >
            {pi > 0 && (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400">Page {pi + 1}</span>
            )}
            <ReportPageItems
              items={blocks}
              ctx={ctx}
              fieldMap={fieldMap}
              scopeFilter={scopeFilter}
              pageIndex={pi}
              pageCount={pages.length}
              header={design.header}
              footer={design.footer}
              headerSkipFirst={design.headerSkipFirst}
              footerSkipFirst={design.footerSkipFirst}
              previewLimit
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportPreview;
