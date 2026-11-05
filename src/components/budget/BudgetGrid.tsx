import React from 'react';
import type { GridCell } from '@glideapps/glide-data-grid';
import {
  InlineGlideTable, type InlineGlideColumn, type InlineGlideEdit, type InlineGlideRowAction,
} from '../InlineGlideTable';
import { textCell, disclosureGlyphCell } from '../../lib/glideCells';
import { buildBudgetRows, collapseBudgetRows, filterBudgetRows, type BudgetGridRow } from '../../lib/budget/gridRows';
import { formatMoney } from '../../lib/budget/format';
import type { BudgetModel, ComputedBudgetLine } from '../../lib/budget/calc';
import type { BudgetLine, BudgetSettings } from '../../types';
import { budgetBandTheme } from './budgetBandTheme';
import type { GlideViewRestore, GlideViewState } from '../../lib/glideViewState';
import {
  collapsedAccountIds, collapsedCategoryIds, isAccountCollapsed, isCategoryCollapsed,
  toggleAccountCollapse, toggleCategoryCollapse,
} from './sheetCollapse';

/** One semantic edit from the budget grid (already translated from a Glide
 *  cell edit), committed by the view in one undo entry. */
export interface BudgetGridCommit {
  kind: 'line' | 'category' | 'account';
  id: string;
  colKey: string;
  value: string;
}

const COLUMNS: InlineGlideColumn[] = [
  { key: 'disclosure', label: '', width: 22 },
  { key: 'item', label: 'Account / Description', width: 300 },
  { key: 'qty', label: 'Qty', width: 54, align: 'center' },
  { key: 'unit', label: 'Unit', width: 68, align: 'center' },
  { key: 'rate', label: 'Rate', width: 88, align: 'right' },
  { key: 'x', label: 'X', width: 42, align: 'center' },
  { key: 'cur', label: 'Cur', width: 58, align: 'center' },
  { key: 'fringes', label: 'Fringes', width: 118 },
  { key: 'groups', label: 'Groups', width: 96 },
  { key: 'total', label: 'Total', width: 102, align: 'right' },
];

/** Item 355 — category/account labels run across the empty middle columns
 *  (Qty → Cur) instead of clipping at the Account column. Every cell in a
 *  Glide span must report the same range. */
const HEADER_SPAN: readonly [number, number] = [1, 6];
const HEADER_SPAN_KEYS = new Set(['item', 'qty', 'unit', 'rate', 'x', 'cur']);

const EDITABLE = new Set(['item', 'qty', 'unit', 'rate', 'x', 'cur', 'fringes', 'groups']);

/**
 * The editable budget detail sheet — the shared `InlineGlideTable` recipe with
 * category/account headers expanded in place (`docs/BUDGETING-SURFACES.md` §2).
 * Cells use the shared painted pickers/entity dropdowns (unit, currency,
 * fringes, groups); there is no second grid engine.
 */
export function BudgetGrid({
  model, readOnly, focusCategoryId, filter, onFilterCounts, viewEpoch = 0,
  onCommit, onOpenLine, onOpenNode, onAddAccount, onQuickAddLine, onQuickAddAccountLine, onQuickAddLastLine,
  onBulkAddLines, onDuplicateLine,
  onDeleteCategory, onDeleteAccount, onDeleteLine, onDeleteMarkup,
  viewRestore, onViewChange,
}: {
  model: BudgetModel;
  readOnly: boolean;
  focusCategoryId: string | null;
  /** Display-only row filter (roadmap 342) — comma tags AND-match. */
  filter: string;
  /** Reports visible (filtered) vs all sheet rows for the toolbar count. */
  onFilterCounts?: (shown: number, total: number) => void;
  /** Bumped by the rail on every category pick (unfold-all re-render even when
   *  the focused category is unchanged). */
  viewEpoch?: number;
  onCommit: (commits: BudgetGridCommit[]) => void;
  onOpenLine: (line: BudgetLine) => void;
  onOpenNode: (kind: 'category' | 'account', id: string) => void;
  onAddAccount: (categoryId: string) => void;
  /** Category row "+": add a line directly (no modal). Returns the line id. */
  onQuickAddLine: (categoryId: string) => string | null;
  /** Account row context "Add line": add directly (no modal). Returns the line id. */
  onQuickAddAccountLine: (accountId: string) => string;
  /** Shift+Enter with nothing focused: append to the sheet's last account. */
  onQuickAddLastLine: () => string | null;
  /** Context-menu "Add line…": ask a count, create N lines in one batch. */
  onBulkAddLines: (kind: 'category' | 'account', id: string) => void;
  onDuplicateLine: (lineId: string) => void;
  onDeleteCategory: (id: string) => void;
  onDeleteAccount: (id: string) => void;
  onDeleteLine: (id: string) => void;
  onDeleteMarkup: (id: string) => void;
  viewRestore?: GlideViewRestore | null;
  onViewChange?: (state: GlideViewState) => void;
}) {
  const units = model.budget.units || [];
  const currencies = model.budget.currencies || [];
  const fringes = model.budget.fringes || [];
  const groups = model.budget.groups || [];
  const settings = model.settings;

  /** View-only disclosure state lives in the module sets; this revision bump
   *  re-renders the flattened rows (never a project/undo write). */
  const [viewRev, bumpView] = React.useReducer((x: number) => x + 1, 0);
  const toggleCategory = React.useCallback((id: string) => {
    toggleCategoryCollapse(id);
    bumpView();
  }, []);
  const toggleAccount = React.useCallback((id: string) => {
    toggleAccountCollapse(id);
    bumpView();
  }, []);

  /** One builder feeds the grid + the filter (`lib/budget/gridRows.ts`). */
  const allRows = React.useMemo(
    () => buildBudgetRows(model, focusCategoryId, settings),
    [model, focusCategoryId, settings],
  );
  const filteredRows = React.useMemo(() => filterBudgetRows(allRows, filter), [allRows, filter]);
  const rows = React.useMemo(
    () => collapseBudgetRows(filteredRows, collapsedCategoryIds(), collapsedAccountIds()),
    // viewRev/viewEpoch are the mutation signals for the module-level collapse
    // sets (local toggle vs rail-driven unfold-all).
    [filteredRows, viewRev, viewEpoch],
  );
  const onFilterCountsRef = React.useRef(onFilterCounts);
  onFilterCountsRef.current = onFilterCounts;
  React.useEffect(() => {
    onFilterCountsRef.current?.(filteredRows.length, allRows.length);
  }, [filteredRows.length, allRows.length]);

  const rowMeta = React.useMemo(() => new Map(rows.map((r, i) => [i, r])), [rows]);

  /** line id → its account id (Shift+Enter on a line row adds beside it). */
  const accountByLineId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of model.categories) for (const acc of cat.accounts) for (const line of acc.lines) map.set(line.line.id, acc.account.id);
    return map;
  }, [model]);

  const commit = React.useCallback((edits: InlineGlideEdit[]) => {
    const commits: BudgetGridCommit[] = [];
    for (const edit of edits) {
      const row = rowMeta.get(edit.row);
      if (!row || row.kind === 'markup') continue;
      if (row.kind !== 'line' && edit.colKey !== 'item') continue;
      commits.push({ kind: row.kind, id: row.id, colKey: edit.colKey, value: edit.value });
    }
    if (commits.length > 0) onCommit(commits);
  }, [rowMeta, onCommit]);

  const editors = React.useMemo(() => ({
    unit: { kind: 'enum' as const, options: units.map(u => u.name), placeholder: 'Unit' },
    cur: { kind: 'enum' as const, options: currencies.map(c => c.code), placeholder: 'Currency' },
    fringes: {
      kind: 'entity' as const,
      mode: 'multi' as const,
      displayMode: 'name' as const,
      allowFreeText: true,
      items: fringes.map(f => ({ id: f.id, name: f.name })),
      placeholder: 'Fringes',
    },
    groups: {
      kind: 'entity' as const,
      mode: 'multi' as const,
      displayMode: 'name' as const,
      allowFreeText: true,
      items: groups.map(g => ({ id: g.id, name: g.name })),
      placeholder: 'Groups',
    },
  }), [units, currencies, fringes, groups]);

  /** Per-line fringe editor (roadmap 338): every item's `detail` is the
   *  canonical computed contribution for THIS line (`computeBudget` →
   *  `computedLine.fringes[].cents`) plus the library definition. Never a
   *  re-derived fringe amount. */
  const computedByLineId = React.useMemo(() => {
    const map = new Map<string, ComputedBudgetLine>();
    for (const cat of model.categories) for (const acc of cat.accounts) for (const l of acc.lines) map.set(l.line.id, l);
    return map;
  }, [model]);
  const getEditorCfg = React.useCallback((rowIndex: number, colKey: string) => {
    // The per-row hook exists for the fringe contribution detail. Everything
    // else must fall back to the shared column editors (unit/currency/groups) —
    // returning undefined here would make Glide open its stock text editor.
    if (colKey !== 'fringes') return editors[colKey as keyof typeof editors];
    const row = rowMeta.get(rowIndex);
    if (!row || row.kind !== 'line') return undefined;
    const centsById = new Map((computedByLineId.get(row.id)?.fringes || []).map(f => [f.id, f.cents]));
    return {
      kind: 'entity' as const,
      mode: 'multi' as const,
      displayMode: 'name' as const,
      allowFreeText: true,
      placeholder: 'Fringes',
      items: fringes.map(f => {
        const cents = centsById.get(f.id);
        const def = f.calc === 'percent'
          ? `${f.percent || 0}%`
          : f.calc === 'fixedPerUnit' ? `${formatMoney(f.amountCents || 0, settings)}/unit` : formatMoney(f.amountCents || 0, settings);
        return { id: f.id, name: f.name, detail: `${cents != null ? `+ ${formatMoney(cents, settings)}` : '—'} · ${def}` };
      }),
    };
  }, [rowMeta, computedByLineId, fringes, settings, editors]);

  /** The (i) action + the same actions as right-click items. */
  const actionsFor = React.useCallback((row: BudgetGridRow): { label: string; run: () => void; danger?: boolean }[] => {
    if (readOnly) return [];
    if (row.kind === 'category') {
      return [
        { label: 'Add line…', run: () => onBulkAddLines('category', row.id) },
        { label: 'Edit category', run: () => onOpenNode('category', row.id) },
        { label: 'Add account', run: () => onAddAccount(row.id) },
        { label: 'Delete category', run: () => onDeleteCategory(row.id), danger: true },
      ];
    }
    if (row.kind === 'account') {
      return [
        { label: 'Add line…', run: () => onBulkAddLines('account', row.id) },
        { label: 'Edit account', run: () => onOpenNode('account', row.id) },
        { label: 'Delete account', run: () => onDeleteAccount(row.id), danger: true },
      ];
    }
    if (row.kind === 'line') {
      return [
        { label: 'Line details', run: () => {
          const line = model.categories.flatMap(c => c.accounts).flatMap(a => a.lines).find(l => l.line.id === row.id)?.line;
          if (line) onOpenLine(line);
        } },
        { label: 'Duplicate line', run: () => onDuplicateLine(row.id) },
        { label: 'Delete line', run: () => onDeleteLine(row.id), danger: true },
      ];
    }
    return [{ label: 'Delete markup', run: () => onDeleteMarkup(row.id), danger: true }];
  }, [readOnly, model, onOpenNode, onAddAccount, onQuickAddLine, onQuickAddAccountLine, onOpenLine, onDuplicateLine, onDeleteCategory, onDeleteAccount, onDeleteLine, onDeleteMarkup, onBulkAddLines]);

  /** The (i) glyph is INSPECT/EDIT only (roadmap 335): its target is explicit
   *  per row kind, never the first context-menu action. Category/account rows
   *  open their node editor, line rows open the line editor; markup rows have
   *  no editor. Quick-add lives on the + glyph and the right-click menu. */
  const rowInfo = React.useCallback((rowIndex: number) => {
    const row = rowMeta.get(rowIndex);
    if (!row) return null;
    if (row.kind === 'category') return { title: 'Edit category', onClick: () => onOpenNode('category', row.id) };
    if (row.kind === 'account') return { title: 'Edit account', onClick: () => onOpenNode('account', row.id) };
    if (row.kind === 'line') {
      const line = model.categories.flatMap(c => c.accounts).flatMap(a => a.lines).find(l => l.line.id === row.id)?.line;
      return line ? { title: 'Line details', onClick: () => onOpenLine(line) } : null;
    }
    return null;
  }, [rowMeta, model, onOpenNode, onOpenLine]);

  /** Shift+Enter (roadmap 337): add a line in the focused row's context (its
   *  account), or append to the sheet when nothing is focused. Returns the new
   *  row key so the grid can move the selection onto it. */
  const addRowFrom = React.useCallback((rowIndex: number | null): string | null => {
    if (readOnly) return null;
    const row = rowIndex == null ? undefined : rowMeta.get(rowIndex);
    if (row?.kind === 'category') {
      const id = onQuickAddLine(row.id);
      return id ? `line:${id}` : null;
    }
    if (row?.kind === 'account') return `line:${onQuickAddAccountLine(row.id)}`;
    if (row?.kind === 'line') {
      const accountId = accountByLineId.get(row.id);
      return accountId ? `line:${onQuickAddAccountLine(accountId)}` : null;
    }
    const id = onQuickAddLastLine();
    return id ? `line:${id}` : null;
  }, [rowMeta, accountByLineId, onQuickAddLine, onQuickAddAccountLine, onQuickAddLastLine]);

  /** Glyph cells are keyboard-activatable through `InlineGlideTable`'s
   *  `onCellActivated` (Enter/Space on the disclosure) — no arrow-key shortcut. */

  const rowTheme = React.useCallback((rowIndex: number) => {
    const row = rowMeta.get(rowIndex);
    return row ? budgetBandTheme(row.kind) : undefined;
  }, [rowMeta]);

  /** Persistent trash column — every deletable row gets its own glyph. */
  const rowActions = React.useCallback((rowIndex: number): InlineGlideRowAction[] => {
    const row = rowMeta.get(rowIndex);
    if (!row || readOnly) return [];
    if (row.kind === 'category') return [{ key: 'delete', title: 'Delete category', icon: 'trash', onClick: () => onDeleteCategory(row.id) }];
    if (row.kind === 'account') return [{ key: 'delete', title: 'Delete account', icon: 'trash', onClick: () => onDeleteAccount(row.id) }];
    if (row.kind === 'line') return [{ key: 'delete', title: 'Delete line', icon: 'trash', onClick: () => onDeleteLine(row.id) }];
    return [{ key: 'delete', title: 'Delete markup', icon: 'trash', onClick: () => onDeleteMarkup(row.id) }];
  }, [rowMeta, readOnly, onDeleteCategory, onDeleteAccount, onDeleteLine, onDeleteMarkup]);

  const rowMenuItems = React.useCallback((rowIndex: number, close: () => void) => {
    const row = rowMeta.get(rowIndex);
    if (!row) return null;
    const actions = actionsFor(row);
    if (actions.length === 0) return null;
    return (
      <>
        {actions.map(action => (
          <button
            key={action.label}
            type="button"
            onClick={() => { close(); action.run(); }}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--ui-item-hover-bg)] ${action.danger ? 'text-red-600' : 'text-[color:var(--ui-text-strong)]'}`}
          >
            {action.label}
          </button>
        ))}
      </>
    );
  }, [rowMeta, actionsFor]);

  const getCellContent = React.useCallback((col: InlineGlideColumn, row: BudgetGridRow): GridCell => {
    const kind = row.kind;
    const isHeader = kind === 'category' || kind === 'account';
    const editable = !readOnly && kind === 'line' && EDITABLE.has(col.key);
    // Item 355: a band label flows across the empty cells to its right.
    if (isHeader && HEADER_SPAN_KEYS.has(col.key)) {
      return textCell(col.key === 'item' ? row.item : '', {
        readonly: true,
        allowOverlay: false,
        align: col.key === 'item' ? 'left' : col.align,
        span: HEADER_SPAN,
      });
    }
    switch (col.key) {
      case 'disclosure':
        // No children → no chevron (a plain blank lane, not a dead control).
        if (row.hasChildren !== '1') return textCell('', { readonly: true, allowOverlay: false });
        if (kind === 'category') {
          return disclosureGlyphCell({
            expanded: !isCategoryCollapsed(row.id),
            label: `${isCategoryCollapsed(row.id) ? 'Expand' : 'Collapse'} ${row.item}`,
            onActivate: () => toggleCategory(row.id),
          });
        }
        if (kind === 'account') {
          return disclosureGlyphCell({
            expanded: !isAccountCollapsed(row.id),
            label: `${isAccountCollapsed(row.id) ? 'Expand' : 'Collapse'} ${row.item}`,
            onActivate: () => toggleAccount(row.id),
          });
        }
        return textCell('', { readonly: true, allowOverlay: false });
      case 'item':
        return textCell(row.item, {
          readonly: !editable,
          align: 'left',
          themeOverride: kind === 'markup' ? { textDark: '#71717a', textLight: '#71717a' } : undefined,
        });
      case 'qty':
        return textCell(row.qty, { readonly: !editable, align: 'center' });
      case 'rate':
        return textCell(row.rate, { readonly: !editable, align: 'right', displayData: row.rate ? formatMoney(Math.round(Number(row.rate) * 100), { ...settings, decimals: 2, currencySymbol: row.curSymbol || settings.currencySymbol }) : '' });
      case 'x':
        return textCell(row.x, { readonly: !editable, align: 'center' });
      case 'cur':
        return textCell(row.cur, {
          readonly: !editable,
          align: 'center',
          displayData: row.cur ? [row.curSymbol, row.cur].filter(Boolean).join(' ') : '',
        });
      case 'unit':
        return textCell(row.unit, { readonly: !editable, align: 'center' });
      case 'fringes':
      case 'groups':
        return textCell(row[col.key], { readonly: !editable });
      case 'total':
        return textCell(row.total, { readonly: true, align: 'right' });
      default:
        return textCell(row[col.key] ?? '', { readonly: true });
    }
  }, [readOnly, settings, toggleCategory, toggleAccount]);

  if (model.categories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 text-center">
        <div>
          <p className="text-sm font-semibold text-[color:var(--ui-text-strong)]">No categories yet</p>
          <p className="text-xs text-[color:var(--ui-text-muted)] mt-1">Add a category to start the chart of accounts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-budget-grid>
      <InlineGlideTable
        columns={COLUMNS}
        rows={rows}
        getCellContent={getCellContent}
        onCommit={commit}
        editableKeys={EDITABLE}
        readOnly={readOnly}
        rowActions={rowActions}
        rowInfo={rowInfo}
        rowThemeOverride={rowTheme}
        heightMode="fill"
        columnSizing="natural"
        rowMenuItems={rowMenuItems}
        onAddRow={addRowFrom}
        editors={editors}
        getEditor={getEditorCfg}
        baseRowHeight={26}
        baseHeaderHeight={30}
        presenceScope="budget:detail"
        presenceRowKey={(row) => row.key}
        viewRestore={viewRestore}
        onViewChange={onViewChange}
      />
    </div>
  );
}
