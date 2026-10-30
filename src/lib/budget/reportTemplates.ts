import type { ReportBlock, ReportDesign } from '../../types';
import { cid } from '../ribbonUtils';
import { makeReportBlock } from '../reportBlocks';

/**
 * Built-in, TRANSIENT budget print designs (`docs/BUDGETING-SURFACES.md` §8).
 * They are never seeded into a project: the Budget tab's Print menu hands one
 * to `ReportPrintDialog`, and "Save as design" clones it into
 * `project.reportDesigns` via `ADD_REPORT_DESIGN` when the user wants it
 * editable. Only existing block types are used — the budget table leaf plus
 * fields/text/columns — never a parallel report engine.
 */

function textBlock(text: string, extra: Partial<ReportBlock> = {}): ReportBlock {
  return { id: cid(), type: 'text', text, ...extra };
}

function pageFooter(): ReportBlock[] {
  return [textBlock('Page {{pageNumber}} of {{pageCount}}', { fontSize: 8, align: 'right', paddingV: 0, paddingH: 4 })];
}

function budgetTable(partial: Partial<ReportBlock>): ReportBlock {
  return makeReportBlock('budgetTable', { paddingV: 1, paddingH: 3, ...partial });
}

/** 1. Budget — Top Sheet (landscape): one row per category, subtotal,
 *  markups/contingency and grand total; % of grand and fringes columns. */
export function budgetTopSheetDesign(): ReportDesign {
  return {
    id: cid(),
    name: 'Budget — Top Sheet',
    createdAt: Date.now(),
    page: 'landscape',
    blocks: [
      textBlock('{{title}} — Budget Top Sheet', { fontSize: 16, bold: true, align: 'center' }),
      textBlock('Top Sheet · {{budgetBaseTotal}} subtotal · Printed {{printDate}}', { fontSize: 9, align: 'center', paddingV: 2 }),
      budgetTable({
        budgetMode: 'topsheet',
        showZero: false,
        showFringes: true,
        showPercent: true,
        showNotes: false,
      }),
    ],
    footer: pageFooter(),
  };
}

/** 2. Budget — Account Detail (landscape): category → account → line rows with
 *  account subtotals and notes; the paginator repeats the header + carry the
 *  category/account rows with their first line (`data-rm-keep-with-next`). */
export function budgetAccountDetailDesign(): ReportDesign {
  return {
    id: cid(),
    name: 'Budget — Account Detail',
    createdAt: Date.now(),
    page: 'landscape',
    blocks: [
      textBlock('{{title}} — Budget Account Detail', { fontSize: 16, bold: true, align: 'center' }),
      textBlock('Account Detail · Printed {{printDate}}', { fontSize: 9, align: 'center', paddingV: 2 }),
      budgetTable({
        budgetMode: 'lines',
        showZero: false,
        showFringes: true,
        showPercent: true,
        showNotes: true,
      }),
    ],
    footer: pageFooter(),
  };
}

/** 3. Budget Health (portrait, one page): the executive summary — grand total,
 *  ATL/BTL/Post, fringes, contingency, net, cost per shoot day, top accounts. */
export function budgetHealthDesign(): ReportDesign {
  return {
    id: cid(),
    name: 'Budget Health',
    createdAt: Date.now(),
    page: 'portrait',
    blocks: [
      textBlock('{{title}} — Budget Health', { fontSize: 16, bold: true, align: 'center' }),
      textBlock('Printed {{printDate}}', { fontSize: 9, align: 'center', paddingV: 2 }),
      { id: cid(), type: 'field', field: 'budgetGrandTotal', prefix: 'Grand total: ', fontSize: 20, bold: true, paddingV: 8 },
      textBlock('Above the line {{budgetAtl}}   ·   Below the line {{budgetBtl}}   ·   Post {{budgetPost}}', { fontSize: 10 }),
      textBlock('Fringes {{budgetFringes}}   ·   Contingency {{budgetContingency}}   ·   Net {{budgetNet}}', { fontSize: 10 }),
      textBlock('Cost per shoot day {{budgetCostPerShootDay}} across {{totalShootDays}} shoot days', { fontSize: 10, paddingV: 4 }),
      { id: cid(), type: 'spacer', spacerStyle: 'line', spacerThickness: 1, height: 14 },
      textBlock('Accounts', { fontSize: 11, bold: true, paddingV: 8 }),
      budgetTable({
        budgetMode: 'accounts',
        showZero: false,
        showFringes: false,
        showPercent: true,
        showNotes: false,
      }),
    ],
    footer: pageFooter(),
  };
}

/** 4. Cost Report — Budget vs Actual (landscape, roadmap 334 phase 2): the
 *  live cost table plus a KPI line. Actual is as-of the print date until the
 *  block/design sets `costAsOf`; EFC/variance always stay as-of. */
export function costReportDesign(): ReportDesign {
  return {
    id: cid(),
    name: 'Cost Report — Budget vs Actual',
    createdAt: Date.now(),
    page: 'landscape',
    blocks: [
      textBlock('{{title}} — Cost Report', { fontSize: 16, bold: true, align: 'center' }),
      textBlock('As of {{crAsOf}} · Budget {{crBudgetTotal}} · Actual {{crActualTotal}} · Committed {{crCommittedTotal}}', { fontSize: 9, align: 'center', paddingV: 2 }),
      textBlock('EFC {{crEfcTotal}} · Variance {{crVarianceTotal}} · {{crPercentUsedTotal}} used · Printed {{printDate}}', { fontSize: 9, align: 'center', paddingV: 2 }),
      budgetTable({
        budgetMode: 'costReport',
        showZero: false,
        showPercent: true,
        showNotes: false,
      }),
    ],
    footer: pageFooter(),
  };
}

/** All built-in budget prints, in menu order. */
export function budgetReportDesigns(): ReportDesign[] {
  return [budgetTopSheetDesign(), budgetAccountDetailDesign(), budgetHealthDesign(), costReportDesign()];
}
