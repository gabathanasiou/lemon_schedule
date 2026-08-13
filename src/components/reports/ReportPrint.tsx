import React, { useMemo } from 'react';
import { Project, ScheduleVersion, ReportDesign } from '../../types';
import { buildReportCtx, ReportDaybreakData, ReportScopeFilter } from '../../lib/reportData';
import { getReportFieldMap } from '../../lib/reportFields';
import { ReportBlockView, ReportPageItems } from './ReportBlockView';
import { buildReportPages } from '../../lib/reportPagination';
import { BASE_PRINT_RESET } from '../print/shared/basePrintCss';
import { REPORT_PAGE_WIDTHS } from './reportStyle';

interface ReportPrintProps {
  project: Project;
  version: ScheduleVersion;
  design: ReportDesign;
  daybreak: ReportDaybreakData;
  scopeFilter?: ReportScopeFilter;
}

const ReportPrint: React.FC<ReportPrintProps> = ({ project, version, design, daybreak, scopeFilter }) => {
  const ctx = useMemo(() => buildReportCtx(project, version, daybreak), [project, version, daybreak]);
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const pages = useMemo(() => buildReportPages(design.blocks || [], ctx, scopeFilter), [design.blocks, ctx, scopeFilter]);

  const css = `
${BASE_PRINT_RESET}
@page { size: ${design.page}; margin: 10mm 8mm; }
.report-root {
  font-family: Helvetica, sans-serif;
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* nested page-break blocks (inside repeat children/columns) */
.report-page-break { page-break-before: always; break-before: page; }
`;

  return (
    <div>
      <style>{css}</style>
      <div className="report-root">
        <div style={{ maxWidth: REPORT_PAGE_WIDTHS[design.page], margin: '0 auto' }}>
          {pages.map((blocks, pi) => (
            <div
              key={pi}
              className="report-page"
              style={pi > 0
                ? { pageBreakBefore: 'always', breakBefore: 'page' }
                : undefined}
            >
              {blocks.length === 0
                ? <div style={{ height: 1 }} aria-hidden />
                : <ReportPageItems items={blocks} ctx={ctx} fieldMap={fieldMap} scopeFilter={scopeFilter} pageIndex={pi} pageCount={pages.length} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReportPrint;
