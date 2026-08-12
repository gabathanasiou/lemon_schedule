import React from 'react';
import { ReportDesign } from '../../types';
import { ReportCtx } from '../../lib/reportData';
import { ReportFieldDef } from '../../lib/reportFields';
import { ReportBlockView } from './ReportBlockView';
import { REPORT_PAGE_WIDTHS } from './reportStyle';
import { X } from 'lucide-react';

// Clean print view (Preview toggle) — same renderer, no structure chrome.

interface ReportPreviewProps {
  design: ReportDesign;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  scopeFilter?: { days?: number[] };
  onExit: () => void;
}

const ReportPreview: React.FC<ReportPreviewProps> = ({ design, ctx, fieldMap, scopeFilter, onExit }) => {
  return (
    <div className="flex-1 overflow-y-auto bg-zinc-800 p-8">
      <div className="sticky top-0 z-20 flex justify-between mb-4 print:hidden">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white"
        >
          <X className="w-3.5 h-3.5" /> Exit Preview
        </button>
        <span className="text-xs text-zinc-500">Esc also exits · Print prints this view</span>
      </div>
      <div
        className="mx-auto bg-white shadow-2xl"
        style={{ width: REPORT_PAGE_WIDTHS[design.page], minHeight: REPORT_PAGE_WIDTHS[design.page] * 1.414, padding: '14mm 12mm' }}
      >
        {design.blocks.map(b => (
          <ReportBlockView key={b.id} block={b} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} />
        ))}
      </div>
    </div>
  );
};

export default ReportPreview;
