import React, { useMemo } from 'react';
import { Project, ScheduleVersion, ReportDesign } from '../../types';
import { buildReportCtx, ReportDaybreakData, ReportScopeFilter, ReportPrintOptions } from '../../lib/reportData';
import { getReportFieldMap } from '../../lib/reportFields';
import { ReportChunkPage } from './ReportBlockView';
import { buildReportPages } from '../../lib/reportPagination';
import { BASE_PRINT_RESET } from '../print/shared/basePrintCss';
import { REPORT_PAGE_METRICS } from './reportStyle';
import { useReportPaginator, ReportMeasureContainer } from './useReportPaginator';

interface ReportPrintProps {
  project: Project;
  version: ScheduleVersion;
  design: ReportDesign;
  daybreak: ReportDaybreakData;
  scopeFilter?: ReportScopeFilter;
  printOptions?: ReportPrintOptions;
  onReady?: () => void;
}

const ReportPrint: React.FC<ReportPrintProps> = ({ project, version, design, daybreak, scopeFilter, printOptions, onReady }) => {
  const ctx = useMemo(() => buildReportCtx(project, version, daybreak), [project, version, daybreak]);
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const page = printOptions?.page || design.page;
  const pages = useMemo(() => buildReportPages(design.blocks || [], ctx, scopeFilter), [design.blocks, ctx, scopeFilter]);
  const metrics = REPORT_PAGE_METRICS[page];
  const measureRef = React.useRef<HTMLDivElement>(null);
  const { chunks, measured } = useReportPaginator({
    measureRef,
    pages,
    headerBlocks: design.header,
    footerBlocks: design.footer,
    headerSkipFirst: design.headerSkipFirst,
    footerSkipFirst: design.footerSkipFirst,
    page,
    ctx,
    fieldMap,
    scopeFilter,
    ribbonOverrides: printOptions?.ribbonOverrides,
    onReady,
  });

  const size = page === 'portrait' ? '210mm 297mm' : '297mm 210mm';
  const css = `
${BASE_PRINT_RESET}
@page { size: ${size}; margin: 14mm 12mm; }
.report-root {
  font-family: Helvetica, sans-serif;
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.report-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: ${metrics.contentWidth}px;
  margin: 0 auto;
}
/* On screen the page div must not stretch to the viewport (100vh would
   float the footer above/below the content) — pin it to the content
   budget so the footer always sits below the content. In print, 100vh is
   the sheet: the footer lands at the sheet bottom (Pages-style). */
@media screen {
  .report-page { min-height: 0; height: ${metrics.contentHeight}px; }
}
.report-page-footer { margin-top: auto; padding-top: 8pt; }
.report-page-header { margin-bottom: 8pt; }
`;

  return (
    <div>
      <style>{css}</style>
      <div className="report-root" data-paginated={chunks ? 'true' : 'false'}>
        {chunks ? (
          <div style={{ width: metrics.contentWidth, margin: '0 auto' }}>
            {chunks.map((chunk, pi) => (
              <div key={pi} className="report-page" style={pi > 0 ? { pageBreakBefore: 'always', breakBefore: 'page' } : undefined}>
                {chunk.body.length === 0
                  ? <div style={{ height: 1 }} aria-hidden />
                  : <ReportChunkPage chunk={chunk} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} pageIndex={pi} pageCount={chunks.length} headerBlocks={design.header} footerBlocks={design.footer} ribbonOverrides={printOptions?.ribbonOverrides} />}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {!measured && <ReportMeasureContainer ref={measureRef} pages={pages} headerBlocks={design.header} footerBlocks={design.footer} headerSkipFirst={design.headerSkipFirst} footerSkipFirst={design.footerSkipFirst} page={page} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} ribbonOverrides={printOptions?.ribbonOverrides} previewLimit={false} />}
    </div>
  );
};

export default ReportPrint;