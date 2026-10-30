import React from 'react';
import type { GridCell } from '@glideapps/glide-data-grid';
import {
  InlineGlideTable, type InlineGlideColumn, type InlineGlideEdit, type InlineGlideRowAction,
} from '../InlineGlideTable';
import { textCell } from '../../lib/glideCells';
import { formatMoney } from '../../lib/budget/format';
import type { BudgetModel, ComputedBudgetLine } from '../../lib/budget/calc';
import type { BudgetLine, BudgetSettings } from '../../types';

/** One semantic edit from the budget grid (already translated from a Glide
 *  cell edit), committed by the view in one undo entry. */
export interface BudgetGridCommit {
  kind: 'line' | 'category' | 'account';
  id: string;
  colKey: string;
  value: string;
}

type RowKind = 'category' | 'account' | 'line' | 'markup';

interface BudgetRow extends Record<string, string> {
  key: string;
  kind: RowKind;
  id: string;
  item: string;
  qty: string;
  unit: string;
  rate: string;
  x: string;
  cur: string;
  fringes: string;
  groups: string;
  total: string;
}

const COLUMNS: InlineGlideColumn[] = [
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

const EDITABLE = new Set(['item', 'qty', 'unit', 'rate', 'x', 'cur', 'fringes', 'groups']);
const CATEGORY_BG = '#e8e8ea';
const ACCOUNT_BG = '#f6f6f7';
const STRONG_TEXT = '#18181b';
const ACCOUNT_TEXT = '#3f3f46';

function itemLabel(number: string | undefined, name: string): string {
  return number ? `${number}  ${name}` : name;
}

function lineTotalLabel(line: ComputedBudgetLine, settings: BudgetSettings): string {
  return formatMoney(line.localTotalCents, { ...settings, currencySymbol: line.currencySymbol });
}

/**
 * The editable budget detail sheet — the shared `InlineGlideTable` recipe with
 * category/account headers expanded in place (`docs/BUDGETING-SURFACES.md` §2).
 * Cells use the shared painted pickers/entity dropdowns (unit, currency,
 * fringes, groups); there is no second grid engine.
 */
export function BudgetGrid({
  model, readOnly, focusCategoryId,
  onCommit, onOpenLine, onOpenNode, onAddAccount, onAddLine, onDuplicateLine,
  onDeleteCategory, onDeleteAccount, onDeleteLine, onDeleteMarkup,
}: {
  model: BudgetModel;
  readOnly: boolean;
  focusCategoryId: string | null;
  onCommit: (commits: BudgetGridCommit[]) => void;
  onOpenLine: (line: BudgetLine) => void;
  onOpenNode: (kind: 'category' | 'account', id: string) => void;
  onAddAccount: (categoryId: string) => void;
  onAddLine: (accountId: string) => void;
  onDuplicateLine: (lineId: string) => void;
  onDeleteCategory: (id: string) => void;
  onDeleteAccount: (id: string) => void;
  onDeleteLine: (id: string) => void;
  onDeleteMarkup: (id: string) => void;
}) {
  const units = model.budget.units || [];
  const currencies = model.budget.currencies || [];
  const fringes = model.budget.fringes || [];
  const groups = model.budget.groups || [];
  const settings = model.settings;

  const unitName = React.useCallback((id: string) => units.find(u => u.id === id)?.name || '', [units]);
  const namesById = React.useCallback((ids: string[] | undefined, list: { id: string; name: string }[]) =>
    (ids || []).map(id => list.find(x => x.id === id)?.name || '').filter(Boolean).join(', '), []);

  const rows = React.useMemo<BudgetRow[]>(() => {
    const out: BudgetRow[] = [];
    for (const cat of model.categories) {
      if (focusCategoryId && cat.category.id !== focusCategoryId) continue;
      out.push({
        key: `cat:${cat.category.id}`, kind: 'category', id: cat.category.id,
        item: itemLabel(cat.category.number, cat.category.name),
        qty: '', unit: '', rate: '', x: '', cur: '',
        fringes: formatMoney(cat.fringeCents, settings),
        groups: '',
        total: formatMoney(cat.totalCents, settings),
      });
      for (const acc of cat.accounts) {
        out.push({
          key: `acc:${acc.account.id}`, kind: 'account', id: acc.account.id,
          item: itemLabel(acc.account.number, acc.account.name),
          qty: '', unit: '', rate: '', x: '', cur: '',
          fringes: formatMoney(acc.fringeCents, settings),
          groups: '',
          total: formatMoney(acc.totalCents, settings),
        });
        for (const line of acc.lines) {
          out.push({
            key: `line:${line.line.id}`, kind: 'line', id: line.line.id,
            item: line.line.description,
            qty: String(line.qty),
            unit: unitName(line.line.unit),
            rate: (line.rateCents / 100).toFixed(2),
            x: String(line.multiplier),
            cur: line.currency,
            fringes: namesById(line.line.fringes, fringes),
            groups: namesById(line.line.groups, groups),
            total: lineTotalLabel(line, settings),
          });
        }
      }
    }
    for (const markup of model.markups) {
      const signed = markup.sign * markup.cents;
      out.push({
        key: `markup:${markup.markup.id}`, kind: 'markup', id: markup.markup.id,
        item: `${markup.markup.name} — ${markup.markup.calc === 'percent' ? `${markup.markup.percent || 0}%` : 'flat'}`,
        qty: '', unit: '', rate: '', x: '', cur: '', fringes: '', groups: '',
        total: formatMoney(signed, settings),
      });
    }
    return out;
  }, [model, focusCategoryId, settings, unitName, namesById]);

  const rowMeta = React.useMemo(() => new Map(rows.map((r, i) => [i, r])), [rows]);

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

  /** The (i) action + the same actions as right-click items. */
  const actionsFor = React.useCallback((row: BudgetRow): { label: string; run: () => void; danger?: boolean }[] => {
    if (readOnly) return [];
    if (row.kind === 'category') {
      return [
        { label: 'Edit category', run: () => onOpenNode('category', row.id) },
        { label: 'Add account', run: () => onAddAccount(row.id) },
        { label: 'Delete category', run: () => onDeleteCategory(row.id), danger: true },
      ];
    }
    if (row.kind === 'account') {
      return [
        { label: 'Edit account', run: () => onOpenNode('account', row.id) },
        { label: 'Add line', run: () => onAddLine(row.id) },
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
  }, [readOnly, model, onOpenNode, onAddAccount, onAddLine, onOpenLine, onDuplicateLine, onDeleteCategory, onDeleteAccount, onDeleteLine, onDeleteMarkup]);

  const rowInfo = React.useCallback((rowIndex: number) => {
    const row = rowMeta.get(rowIndex);
    if (!row || row.kind === 'markup') return null;
    const first = actionsFor(row)[0];
    return first ? { title: first.label, onClick: first.run } : null;
  }, [rowMeta, actionsFor]);

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

  const getCellContent = React.useCallback((col: InlineGlideColumn, row: BudgetRow): GridCell => {
    const kind = row.kind;
    const isHeader = kind === 'category' || kind === 'account';
    const editable = !readOnly && kind === 'line' && EDITABLE.has(col.key);
    switch (col.key) {
      case 'item':
        return textCell(row.item, {
          readonly: !editable,
          align: 'left',
          themeOverride: kind === 'category'
            ? { bgCell: CATEGORY_BG, textDark: STRONG_TEXT, textMedium: STRONG_TEXT, textLight: STRONG_TEXT }
            : kind === 'account'
              ? { bgCell: ACCOUNT_BG, textDark: ACCOUNT_TEXT, textMedium: ACCOUNT_TEXT, textLight: ACCOUNT_TEXT }
              : kind === 'markup'
                ? { textDark: '#71717a', textLight: '#71717a' }
                : undefined,
        });
      case 'qty':
        return textCell(row.qty, { readonly: !editable, align: 'center' });
      case 'rate':
        return textCell(row.rate, { readonly: !editable, align: 'right', displayData: row.rate ? formatMoney(Math.round(Number(row.rate) * 100), { ...settings, decimals: 2 }) : '' });
      case 'x':
        return textCell(row.x, { readonly: !editable, align: 'center' });
      case 'cur':
        return textCell(row.cur, { readonly: !editable, align: 'center' });
      case 'unit':
        return textCell(row.unit, { readonly: !editable, align: 'center' });
      case 'fringes':
      case 'groups':
        return textCell(row[col.key], { readonly: !editable });
      case 'total':
        return textCell(row.total, { readonly: true, align: 'right', themeOverride: kind === 'category' ? { bgCell: CATEGORY_BG } : kind === 'account' ? { bgCell: ACCOUNT_BG } : undefined });
      default:
        return textCell(row[col.key] ?? '', { readonly: true });
    }
  }, [readOnly, settings]);

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
    <div className="flex-1 overflow-auto scrollbar-custom" data-budget-grid>
      <InlineGlideTable
        columns={COLUMNS}
        rows={rows}
        getCellContent={getCellContent}
        onCommit={commit}
        editableKeys={EDITABLE}
        readOnly={readOnly}
        rowActions={rowActions}
        rowInfo={rowInfo}
        rowMenuItems={rowMenuItems}
        editors={editors}
        baseRowHeight={26}
        baseHeaderHeight={30}
        presenceScope="budget:detail"
        presenceRowKey={(row) => row.key}
      />
    </div>
  );
}
