import React, { useMemo } from 'react';
import type { ReportBlock } from '../../types';
import type { ReportCtx } from '../../lib/reportData';
import { budgetReportMode, buildBudgetReport, buildComparisonReport, buildCostReportReport, type BudgetReportColumn, type BudgetReportRow } from '../../lib/reportBudget';
import { formatMoney, formatPercent } from '../../lib/budget/format';
import { getReportBorder, REPORT_TABLE_HEADER_BG } from '../../lib/reportLook';
import { getReportBlockBaseStyle } from './reportStyle';

/**
 * Static renderer for the `budgetTable` block (`docs/BUDGETING-SURFACES.md`
 * §5). Rows/columns/totals all come from `lib/reportBudget.ts` (built on
 * `computeBudget` / `computeCostReport`) — this component only formats money
 * and lays the rows out with the shared `.report-table-cols` / `.rm-row`
 * recipe, so the measured paginator splits between rows and repeats the
 * column header (data-rm-header) on continuation pages.
 */
interface ReportBudgetTableProps {
  block: ReportBlock;
  ctx: ReportCtx;
  hint?: boolean;
  /** Designer Fields mode: show the column blueprint instead of values. */
  showKeys?: boolean;
  /** Measured-pagination row range (includes the header row at index 0). */
  rowRange?: [number, number];
  /** This fragment is a continuation page — repeat the column header. */
  repeatTableHeader?: boolean;
  /** The title node (item 140), built by `ReportBlockView`. */
  title?: React.ReactNode;
}

type FlatRow = { kind: 'header' } | { kind: 'row'; row: BudgetReportRow };

const depthPadding = (row: BudgetReportRow): number => (row.kind === 'line' ? 16 : row.kind === 'category' ? 0 : 6);

const ReportBudgetTable: React.FC<ReportBudgetTableProps> = ({ block, ctx, hint, showKeys, rowRange, repeatTableHeader, title }) => {
  const mode = budgetReportMode(block.budgetMode);
  const model = useMemo(() => {
    if (mode === 'costReport') {
      return buildCostReportReport(ctx.project, ctx.budget, {
        asOf: block.costAsOf,
        from: block.costPeriod?.from,
        to: block.costPeriod?.to,
        categories: block.budgetCategories,
        accounts: block.budgetAccounts,
        columns: block.budgetColumns,
        showZero: block.showZero === true,
        showPercent: block.showPercent !== false,
      });
    }
    if (mode === 'comparison') {
      const primary = block.budgetVersionId
        ? ctx.budgetForVersion?.(block.budgetVersionId)
        : ctx.budget;
      const original = block.budgetCompareVersionId
        ? ctx.budgetForVersion?.(block.budgetCompareVersionId)
        : undefined;
      return buildComparisonReport(primary, original, {
        mode: 'comparison',
        categories: block.budgetCategories,
        accounts: block.budgetAccounts,
        columns: block.budgetColumns,
        showZero: block.showZero === true,
        showPercent: block.showPercent !== false,
      });
    }
    return buildBudgetReport(ctx.budget, {
      mode: block.budgetMode,
      categories: block.budgetCategories,
      accounts: block.budgetAccounts,
      columns: block.budgetColumns,
      showZero: block.showZero === true,
      showFringes: block.showFringes !== false,
      showNotes: block.showNotes === true,
      showPercent: block.showPercent !== false,
    });
  }, [ctx.project, ctx.budget, ctx.budgetForVersion, mode, block.budgetMode, block.budgetCategories, block.budgetAccounts, block.budgetColumns, block.budgetVersionId, block.budgetCompareVersionId, block.costAsOf, block.costPeriod, block.showZero, block.showFringes, block.showNotes, block.showPercent]);

  const baseStyle = getReportBlockBaseStyle(block, ctx.project);
  const cellPad = { padding: `${block.paddingV ?? 2}px ${block.paddingH ?? 4}px` };
  const border = getReportBorder(block.showBorders !== false);
  const headerStyle: React.CSSProperties = { ...baseStyle, ...cellPad, fontWeight: 700, background: REPORT_TABLE_HEADER_BG };

  if (!model || model.rows.length === 0) {
    if (!hint) return null;
    let message: string;
    if (mode === 'comparison') {
      const primaryMissing = block.budgetVersionId
        ? !ctx.budgetForVersion?.(block.budgetVersionId)
        : !ctx.budget;
      const compareMissing = !block.budgetCompareVersionId
        || !ctx.budgetForVersion?.(block.budgetCompareVersionId);
      message = primaryMissing || compareMissing
        ? (block.budgetCompareVersionId
          ? 'That budget version is no longer available — choose another in the block settings.'
          : 'Choose two budget versions in the block settings.')
        : 'No budget rows to print — add categories/lines or widen the filters.';
    } else {
      message = ctx.project.budget
        ? 'No budget rows to print — add categories/lines or widen the filters.'
        : 'No budget yet — create one in the Budget tab.';
    }
    return (
      <div style={{ ...baseStyle, color: '#8f8f8f', fontStyle: 'italic' }}>
        {message}
      </div>
    );
  }

  const flat: FlatRow[] = [{ kind: 'header' }];
  for (const row of model.rows) flat.push({ kind: 'row', row });
  const shown = rowRange ? flat.slice(rowRange[0], rowRange[1]) : flat;
  // Continuation fragments re-render the header (its height was budgeted by
  // the paginator, exactly like the crew/call-times grids).
  const repeatHead = repeatTableHeader === true && !!rowRange && rowRange[0] > 0 && rowRange[1] > rowRange[0] && block.repeatHeader !== false;
  const rowsToRender = repeatHead ? [{ kind: 'header' } as FlatRow, ...shown] : shown;

  const cellText = (row: BudgetReportRow, column: BudgetReportColumn): string => {
    const value = row.cells[column.key];
    if (value == null || value === '') return '\u00A0';
    if (typeof value !== 'number') return String(value);
    if (column.money) {
      const settings = column.key === 'rate' && row.currencySymbol
        ? { ...model.settings, currencySymbol: row.currencySymbol }
        : model.settings;
      return formatMoney(value, settings);
    }
    if (column.percent) return formatPercent(value, 1);
    return String(value);
  };

  const rowStyle = (row: BudgetReportRow): React.CSSProperties => {
    const isTotal = row.kind === 'subtotal' || row.kind === 'markup' || row.kind === 'grand';
    return {
      ...baseStyle,
      ...cellPad,
      fontWeight: row.bold || isTotal ? 700 : 400,
      fontStyle: row.kind === 'subtotal' && row.key !== 'subtotal' ? 'italic' : baseStyle.fontStyle,
      ...(row.kind === 'grand' || row.kind === 'category' ? { background: REPORT_TABLE_HEADER_BG } : {}),
    };
  };

  return (
    <>
      {title}
      <div className="report-table-cols" style={{ borderTop: border, borderLeft: border }}>
        {rowsToRender.map((flatRow, i) => {
          if (flatRow.kind === 'header') {
            return (
              <div key="header" className="rm-row" data-rm-header="1" data-rm-keep-with-next={flat.length > 1 ? '1' : undefined} style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                {model.columns.map(c => (
                  <div key={c.key} style={{ ...headerStyle, width: `${c.width}%`, textAlign: c.align, borderRight: border, borderBottom: border }}>
                    {showKeys ? <span style={{ color: '#8f8f8f', fontStyle: 'italic' }}>{`{{${c.key}}}`}</span> : c.label}
                  </div>
                ))}
              </div>
            );
          }
          const row = flatRow.row;
          return (
            <div
              key={`${row.key}-${i}`}
              className="rm-row"
              data-rm-keep-with-next={row.keepWithNext ? '1' : undefined}
              style={{ display: 'flex', pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              {model.columns.map(c => (
                <div
                  key={c.key}
                  style={{
                    ...rowStyle(row),
                    width: `${c.width}%`,
                    textAlign: c.align,
                    paddingLeft: c.align === 'center' ? undefined : (block.paddingH ?? 4) + depthPadding(row),
                    borderRight: border,
                    borderBottom: border,
                    ...(c.money || c.percent || c.key === 'qty' || c.key === 'multiplier' ? { fontVariantNumeric: 'tabular-nums' } : {}),
                  }}
                >
                  {showKeys ? <span style={{ color: '#8f8f8f', fontStyle: 'italic' }}>{`{{${c.key}}}`}</span> : cellText(row, c)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ReportBudgetTable;
