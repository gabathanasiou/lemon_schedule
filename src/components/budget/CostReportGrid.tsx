import React from 'react';
import type { GridCell } from '@glideapps/glide-data-grid';
import {
  InlineGlideTable, type InlineGlideColumn, type InlineGlideEdit,
} from '../InlineGlideTable';
import { ContextMenuItem } from '../ContextMenu';
import { textCell, disclosureGlyphCell } from '../../lib/glideCells';
import {
  buildCostRows, collapseBudgetRows, filterBudgetRows, type CostGridRow,
} from '../../lib/budget/gridRows';
import type { CostReportModel } from '../../lib/budget/costReport';
import type { BudgetLine } from '../../types';
import { parseMoney } from '../../lib/budget/format';
import { budgetBandTheme } from './budgetBandTheme';
import type { GlideViewRestore, GlideViewState } from '../../lib/glideViewState';
import {
  collapsedAccountIds, collapsedCategoryIds, isAccountCollapsed, isCategoryCollapsed,
  toggleAccountCollapse, toggleCategoryCollapse,
} from './sheetCollapse';

const COLUMNS: InlineGlideColumn[] = [
  { key: 'disclosure', label: '', width: 22 },
  { key: 'item', label: 'Account / Description', width: 300 },
  { key: 'budget', label: 'Budget', width: 92, align: 'right' },
  { key: 'actual', label: 'Actual', width: 92, align: 'right' },
  { key: 'committed', label: 'Committed', width: 92, align: 'right' },
  { key: 'etc', label: 'ETC', width: 92, align: 'right' },
  { key: 'efc', label: 'EFC', width: 92, align: 'right' },
  { key: 'variance', label: 'Variance', width: 118, align: 'right' },
  { key: 'percent', label: '% Used', width: 64, align: 'right' },
  { key: 'reason', label: 'Reason', width: 180 },
];

/** Only the two judgment fields are writable; every money cell is computed. */
const EDITABLE = new Set(['etc', 'reason']);

export interface CostGridUpdate {
  id: string;
  updates: Partial<BudgetLine>;
}

/**
 * The Cost Report mode of the Budget sheet (roadmap 349): the SAME
 * `InlineGlideTable` recipe and row tree as the authoring grid, reading
 * `computeCostReport` only. ETC/reason commit on blur; everything else is a
 * report. Print stays a DOM report table.
 */
export function CostReportGrid({
  report, readOnly, focusCategoryId, filter, onFilterCounts, viewEpoch = 0, onLineUpdates,
  viewRestore, onViewChange,
}: {
  report: CostReportModel;
  readOnly: boolean;
  focusCategoryId: string | null;
  /** Display-only row filter — same AND tags as the Budget sheet. */
  filter: string;
  onFilterCounts?: (shown: number, total: number) => void;
  /** Bumped by the rail on every category pick (unfold-all re-render). */
  viewEpoch?: number;
  onLineUpdates: (updates: CostGridUpdate[]) => void;
  viewRestore?: GlideViewRestore | null;
  onViewChange?: (state: GlideViewState) => void;
}) {
  const settings = report.settings;
  const [viewRev, bumpView] = React.useReducer((x: number) => x + 1, 0);
  const toggleCategory = React.useCallback((id: string) => {
    toggleCategoryCollapse(id);
    bumpView();
  }, []);
  const toggleAccount = React.useCallback((id: string) => {
    toggleAccountCollapse(id);
    bumpView();
  }, []);

  const allRows = React.useMemo(
    () => buildCostRows(report, focusCategoryId, settings),
    [report, focusCategoryId, settings],
  );
  const filteredRows = React.useMemo(() => filterBudgetRows(allRows, filter), [allRows, filter]);
  const rows = React.useMemo(
    () => collapseBudgetRows(filteredRows, collapsedCategoryIds(), collapsedAccountIds()),
    // viewRev/viewEpoch are the mutation signals for the module-level collapse sets.
    [filteredRows, viewRev, viewEpoch],
  );
  const rowMeta = React.useMemo(() => new Map(rows.map((r, i) => [i, r])), [rows]);

  const onFilterCountsRef = React.useRef(onFilterCounts);
  onFilterCountsRef.current = onFilterCounts;
  React.useEffect(() => {
    onFilterCountsRef.current?.(filteredRows.length, allRows.length);
  }, [filteredRows.length, allRows.length]);

  const commit = React.useCallback((edits: InlineGlideEdit[]) => {
    const byId = new Map<string, Partial<BudgetLine>>();
    for (const edit of edits) {
      const row = rowMeta.get(edit.row);
      if (!row || row.kind !== 'line' || !row.lineId) continue;
      if (edit.colKey === 'etc') {
        const raw = edit.value.trim();
        if (raw === '' && !row.hasEtc) continue;
        const cents = raw === '' ? undefined : parseMoney(raw);
        if (cents !== undefined && cents === Number(row.etcCents)) continue;
        byId.set(row.lineId, { ...byId.get(row.lineId), etcCents: cents });
      } else if (edit.colKey === 'reason') {
        const reason = edit.value.trim();
        if (reason === row.reason) continue;
        byId.set(row.lineId, { ...byId.get(row.lineId), etcReason: reason || undefined });
      }
    }
    if (byId.size > 0) {
      onLineUpdates([...byId.entries()].map(([id, updates]) => ({ id, updates })));
    }
  }, [rowMeta, onLineUpdates]);

  const rowMenuItems = React.useCallback((rowIndex: number, close: () => void) => {
    const row = rowMeta.get(rowIndex);
    if (readOnly || !row || row.kind !== 'line' || !row.lineId || !row.hasEtc) return null;
    return (
      <ContextMenuItem
        onClick={() => {
          close();
          onLineUpdates([{ id: row.lineId, updates: { etcCents: undefined } }]);
        }}
      >
        Use automatic ETC
      </ContextMenuItem>
    );
  }, [rowMeta, readOnly, onLineUpdates]);

  const rowTheme = React.useCallback((rowIndex: number) => {
    const row = rowMeta.get(rowIndex);
    return row ? budgetBandTheme(row.kind) : undefined;
  }, [rowMeta]);

  const getCellContent = React.useCallback((col: InlineGlideColumn, row: CostGridRow): GridCell => {
    const isLine = row.kind === 'line';
    switch (col.key) {
      case 'disclosure':
        if (row.hasChildren !== '1') return textCell('', { readonly: true, allowOverlay: false });
        if (row.kind === 'category') {
          return disclosureGlyphCell({
            expanded: !isCategoryCollapsed(row.id),
            label: `${isCategoryCollapsed(row.id) ? 'Expand' : 'Collapse'} ${row.item}`,
            onActivate: () => toggleCategory(row.id),
          });
        }
        return disclosureGlyphCell({
          expanded: !isAccountCollapsed(row.id),
          label: `${isAccountCollapsed(row.id) ? 'Expand' : 'Collapse'} ${row.item}`,
          onActivate: () => toggleAccount(row.id),
        });
      case 'item':
        return textCell(row.item, { readonly: true, allowOverlay: false });
      case 'budget':
      case 'actual':
      case 'committed':
      case 'efc':
      case 'percent':
        return textCell(row[col.key] || '', { readonly: true, align: 'right' });
      case 'etc':
        if (!isLine) return textCell(row.etcDisplay, { readonly: true, align: 'right' });
        return readOnly
          ? textCell(row.etcDisplay, { readonly: true, align: 'right' })
          : textCell(row.etc, { displayData: row.etcDisplay, align: 'right' });
      case 'variance': {
        const color = row.varianceTone === 'good' ? '#047857' : row.varianceTone === 'bad' ? '#b91c1c' : undefined;
        return textCell(row.variance, {
          readonly: true,
          align: 'right',
          themeOverride: color ? { textDark: color, textMedium: color, textLight: color } : undefined,
        });
      }
      case 'reason':
        if (!isLine) return textCell('', { readonly: true, allowOverlay: false });
        return readOnly
          ? textCell(row.reason, { readonly: true, allowOverlay: false })
          : textCell(row.reason, { align: 'left' });
      default:
        return textCell(row[col.key] ?? '', { readonly: true, align: col.align });
    }
  }, [readOnly, toggleAccount, toggleCategory]);

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-cost-report>
      <InlineGlideTable
        columns={COLUMNS}
        rows={rows}
        getCellContent={getCellContent}
        onCommit={commit}
        editableKeys={EDITABLE}
        readOnly={readOnly}
        rowThemeOverride={rowTheme}
        heightMode="fill"
        rowMenuItems={rowMenuItems}
        baseRowHeight={26}
        baseHeaderHeight={30}
        presenceScope="budget:cost"
        presenceRowKey={row => row.key}
        viewRestore={viewRestore}
        onViewChange={onViewChange}
        dataAttr="cost-report-grid"
        emptyLabel="No budget categories yet — add lines in the Budget sheet."
      />
    </div>
  );
}
