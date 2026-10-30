import React from 'react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { Expense, ExpenseMethod, ExpenseStatus, Project } from '../../types';
import {
  InlineGlideTable, type InlineGlideColumn, type InlineGlideEdit, type InlineGlideRowAction,
} from '../InlineGlideTable';
import { textCell } from '../../lib/glideCells';
import { EXPENSE_METHOD_LABELS, EXPENSE_METHODS, EXPENSE_STATUS_LABELS, EXPENSE_STATUSES } from '../../lib/budget/model';
import { expenseStatusTone } from '../../lib/budget/statusTones';
import { formatMoney, parseMoney } from '../../lib/budget/format';
import { expenseAccountLabel } from '../../lib/budget/costReport';

/** One semantic commit from the expense grid (the view maps it to UPDATE_EXPENSE). */
export interface ExpenseGridCommit {
  id: string;
  updates: Partial<Expense>;
}

interface ExpenseRow extends Record<string, string> {
  key: string;
  date: string;
  description: string;
  account: string;
  vendor: string;
  method: string;
  status: string;
  amount: string;
  po: string;
  currencySymbol: string;
}

const COLUMNS: InlineGlideColumn[] = [
  { key: 'date', label: 'Date', width: 82 },
  { key: 'description', label: 'Description', width: 230 },
  { key: 'account', label: 'Account', width: 168 },
  { key: 'vendor', label: 'Vendor', width: 118 },
  { key: 'method', label: 'Method', width: 82, align: 'center' },
  { key: 'status', label: 'Status', width: 82, align: 'center' },
  { key: 'amount', label: 'Amount', width: 96, align: 'right' },
  { key: 'po', label: 'PO', width: 82, align: 'center' },
];

const EDITABLE = new Set(['date', 'description', 'account', 'vendor', 'method', 'status', 'amount', 'po']);
const UNALLOCATED_ID = '__none';
const NO_PO = 'No PO';

/**
 * The expense ledger — the shared `InlineGlideTable` recipe. Editable cells
 * commit on blur/pick through the view's one `UPDATE_EXPENSE` per operation;
 * the (i) glyph opens the shared ExpenseModal, the trash column deletes, and
 * right-click lists the same actions above the generic copy/paste items.
 */
export function ExpensesGrid({
  project, expenses, readOnly, onOpenExpense, onDeleteExpense, onDuplicateExpense, onCommit,
  presenceScope = 'budget:expenses', emptyLabel = 'No expenses yet — add one or import a CSV.', fill = true,
}: {
  project: Project;
  expenses: Expense[];
  readOnly: boolean;
  onOpenExpense: (expense: Expense) => void;
  onDeleteExpense: (expense: Expense) => void;
  onDuplicateExpense: (expense: Expense) => void;
  onCommit: (commits: ExpenseGridCommit[]) => void;
  /** Presence identity — a day-scoped ledger must not share the Budget pool. */
  presenceScope?: string;
  emptyLabel?: string;
  /** `true` (Budget ledger) fills its flex column; `false` (Day card) sits at
   *  content height inside the card. */
  fill?: boolean;
}) {
  const accounts = project.budget?.accounts || [];
  const categories = project.budget?.categories || [];
  const purchaseOrders = project.purchaseOrders || [];
  const settings = project.budget?.settings;

  const accountGroup = React.useCallback((accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    const category = account ? categories.find(c => c.id === account.categoryId) : undefined;
    return category ? `${category.number} ${category.name}`.trim() : 'Accounts';
  }, [accounts, categories]);

  const rows = React.useMemo<ExpenseRow[]>(() => expenses.map(expense => {
    const po = expense.poId ? purchaseOrders.find(p => p.id === expense.poId) : undefined;
    return {
      key: expense.id,
      date: expense.date,
      description: expense.description,
      account: expenseAccountLabel(project, expense),
      vendor: expense.vendor || '',
      method: EXPENSE_METHOD_LABELS[expense.method] || expense.method,
      status: EXPENSE_STATUS_LABELS[expense.status] || expense.status,
      statusKey: expense.status,
      amount: (expense.amountCents / 100).toFixed(2),
      po: po?.number || '',
      currencySymbol: settings?.currencySymbol || '$',
    };
  }), [expenses, purchaseOrders, project, settings]);

  const rowMeta = React.useMemo(() => new Map(rows.map((row, i) => [i, expenses[i]])), [rows, expenses]);

  const commit = React.useCallback((edits: InlineGlideEdit[]) => {
    const byId = new Map<string, Partial<Expense>>();
    for (const edit of edits) {
      const expense = rowMeta.get(edit.row);
      if (!expense) continue;
      const patch = byId.get(expense.id) || {};
      switch (edit.colKey) {
        case 'date':
          if (/^\d{4}-\d{2}-\d{2}$/.test(edit.value.trim())) patch.date = edit.value.trim();
          break;
        case 'description':
          patch.description = edit.value.trim() || expense.description;
          break;
        case 'account': {
          const accountId = accounts.find(a => `${a.number} ${a.name}`.trim().toLowerCase() === edit.value.trim().toLowerCase())?.id;
          patch.accountId = accountId;
          patch.lineId = undefined;
          break;
        }
        case 'vendor':
          patch.vendor = edit.value.trim() || undefined;
          break;
        case 'method': {
          const method = EXPENSE_METHODS.find(m => EXPENSE_METHOD_LABELS[m].toLowerCase() === edit.value.trim().toLowerCase());
          if (method) patch.method = method as ExpenseMethod;
          break;
        }
        case 'status': {
          const status = EXPENSE_STATUSES.find(s => EXPENSE_STATUS_LABELS[s].toLowerCase() === edit.value.trim().toLowerCase());
          if (status) patch.status = status as ExpenseStatus;
          break;
        }
        case 'amount':
          patch.amountCents = parseMoney(edit.value);
          break;
        case 'po': {
          const text = edit.value.trim();
          const po = purchaseOrders.find(p => p.number.toLowerCase() === text.toLowerCase());
          patch.poId = po?.id;
          break;
        }
        default: break;
      }
      byId.set(expense.id, patch);
    }
    if (byId.size > 0) {
      onCommit([...byId.entries()].map(([id, updates]) => ({ id, updates })));
    }
  }, [rowMeta, accounts, purchaseOrders, onCommit]);

  const editors = React.useMemo(() => ({
    account: {
      kind: 'entity' as const,
      mode: 'single' as const,
      displayMode: 'name' as const,
      allowFreeText: false,
      items: [
        { id: UNALLOCATED_ID, name: 'Unallocated', group: 'No account' },
        ...accounts.map(a => ({ id: a.id, name: `${a.number} ${a.name}`.trim(), group: accountGroup(a.id) })),
      ],
    },
    method: { kind: 'enum' as const, options: EXPENSE_METHODS.map(m => EXPENSE_METHOD_LABELS[m]), placeholder: 'Method' },
    status: { kind: 'enum' as const, options: EXPENSE_STATUSES.map(s => EXPENSE_STATUS_LABELS[s]), placeholder: 'Status' },
    po: { kind: 'enum' as const, options: [NO_PO, ...purchaseOrders.filter(p => p.status !== 'cancelled').map(p => p.number)], placeholder: 'PO' },
  }), [accounts, accountGroup, purchaseOrders]);

  const actionsFor = React.useCallback((expense: Expense): { label: string; run: () => void; danger?: boolean }[] => {
    if (readOnly) return [];
    return [
      { label: 'Edit expense', run: () => onOpenExpense(expense) },
      { label: 'Duplicate expense', run: () => onDuplicateExpense(expense) },
      { label: 'Delete expense', run: () => onDeleteExpense(expense), danger: true },
    ];
  }, [readOnly, onOpenExpense, onDeleteExpense, onDuplicateExpense]);

  const rowInfo = React.useCallback((rowIndex: number) => {
    const expense = rowMeta.get(rowIndex);
    return expense ? { title: 'Edit expense', onClick: () => onOpenExpense(expense) } : null;
  }, [rowMeta, onOpenExpense]);

  const rowActions = React.useCallback((rowIndex: number): InlineGlideRowAction[] => {
    const expense = rowMeta.get(rowIndex);
    if (!expense || readOnly) return [];
    return [{ key: 'delete', title: 'Delete expense', icon: 'trash', onClick: () => onDeleteExpense(expense) }];
  }, [rowMeta, readOnly, onDeleteExpense]);

  const rowMenuItems = React.useCallback((rowIndex: number, close: () => void) => {
    const expense = rowMeta.get(rowIndex);
    if (!expense) return null;
    const actions = actionsFor(expense);
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

  const getCellContent = React.useCallback((col: InlineGlideColumn, row: ExpenseRow): GridCell => {
    const editable = !readOnly && EDITABLE.has(col.key);
    switch (col.key) {
      case 'amount':
        return textCell(row.amount, {
          readonly: !editable,
          align: 'right',
          displayData: row.amount ? formatMoney(Math.round(Number(row.amount) * 100), settings) : '',
        });
      case 'date':
      case 'description':
      case 'vendor':
        return textCell(row[col.key], { readonly: !editable, align: 'left' });
      case 'method':
      case 'status':
      case 'po':
      case 'account':
        return textCell(row[col.key], {
          readonly: !editable,
          align: col.key === 'account' ? 'left' : 'center',
          // Status colour is the ONE shared tone map (roadmap 345); the label
          // always stays painted so colour is never the only signal.
          themeOverride: col.key === 'status' ? expenseStatusTone(row.statusKey as any) : undefined,
        });
      default:
        return textCell(row[col.key] ?? '', { readonly: true });
    }
  }, [readOnly, settings]);

  return (
    <div className={fill ? 'flex-1 min-h-0 overflow-hidden' : ''} data-expenses-grid>
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
        emptyLabel={emptyLabel}
        baseRowHeight={26}
        baseHeaderHeight={30}
        presenceScope={presenceScope}
        presenceRowKey={row => row.key}
      />
    </div>
  );
}

export default ExpensesGrid;
