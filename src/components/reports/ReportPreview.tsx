import React from 'react';
import { ReportDesign } from '../../types';
import { ReportCtx } from '../../lib/reportData';
import { ReportFieldDef } from '../../lib/reportFields';
import { ReportBlockView } from './ReportBlockView';
import { REPORT_PAGE_WIDTHS } from './reportStyle';
import { paginateBlocks } from '../../lib/reportBlocks';
import { X } from 'lucide-react';

// Paginated preview — each top-level page break starts a new sheet.

interface ReportPreviewProps {
  design: ReportDesign;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  scopeFilter?: { days?: number[] };
  onExit: () => void;
}

const ReportPreview: React.FC<ReportPreviewProps> = ({ design, ctx, fieldMap, scopeFilter, onExit }) => {
  const pages = React.useMemo(() => paginateBlocks(design.blocks || []), [design.blocks]);
  const pageW = REPORT_PAGE_WIDTHS[design.page];

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-800 p-8">
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
            style={{ width: pageW, minHeight: pageW * 1.414, padding: '14mm 12mm' }}
          >
            {pi > 0 && (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400">Page {pi + 1}</span>
            )}
            {blocks.map(b => (
              <ReportBlockView key={b.id} block={b} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportPreview;
