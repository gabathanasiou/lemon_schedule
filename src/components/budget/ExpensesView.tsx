import React from 'react';
import { ChevronDown, Download, FileUp, Plus, Receipt, RotateCcw } from 'lucide-react';
import type { Expense, Project } from '../../types';
import { useProject } from '../../store';
import { useDayViews } from '../../lib/dayView';
import { useDialog } from '../Dialog';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import DateField from '../DateField';
import { makeExpense, isoToday, EXPENSE_METHODS, EXPENSE_METHOD_LABELS, EXPENSE_STATUSES, EXPENSE_STATUS_LABELS } from '../../lib/budget/model';
import { downloadExpensesCsv, parseExpensesCsv } from '../../lib/budget/expenseCsv';
import { formatMoney } from '../../lib/budget/format';
import { summarizeExpenses } from '../../lib/budget/costReport';
import { formatDateShort } from '../../lib/utils';
import { ExpensesGrid, type ExpenseGridCommit } from './ExpensesGrid';
import { ExpenseModal } from './ExpenseModal';
import { SectionTile } from './SectionTile';

type StatusFilter = 'all' | Expense['status'];
type MethodFilter = 'all' | Expense['method'];

const LIGHT_TRIGGER = 'flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border-strong)] rounded text-xs text-[color:var(--ui-text)] hover:bg-[var(--ui-card-hover)]';

/**
 * Expenses ledger (roadmap 334 phase 2): filters, Add expense, CSV
 * import/export, the editable Glide table and the shared ExpenseModal. The
 * expense list is project state; the Day Manager reads the same array by
 * `dayDate`/`dayNumber`.
 */
export function ExpensesView({
  project, readOnly,
}: {
  project: Project;
  readOnly: boolean;
}) {
  const { dispatch } = useProject();
  const dialog = useDialog();
  const { days } = useDayViews();
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [method, setMethod] = React.useState<MethodFilter>('all');
  const [accountKey, setAccountKey] = React.useState('all');
  const [dayId, setDayId] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [methodOpen, setMethodOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [dayOpen, setDayOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const accounts = project.budget?.accounts || [];
  const categories = project.budget?.categories || [];
  const settings = project.budget?.settings;
  const selectedDay = days.find(d => String(d.sectionIndex) === dayId);

  const filtered = React.useMemo(() => {
    const list = (project.expenses || []).filter(expense => {
      if (status !== 'all' && expense.status !== status) return false;
      if (method !== 'all' && expense.method !== method) return false;
      if (accountKey === 'none' && expense.accountId) return false;
      if (accountKey !== 'all' && accountKey !== 'none' && expense.accountId !== accountKey) return false;
      if (selectedDay && expense.dayDate !== selectedDay.date && expense.dayNumber !== selectedDay.chronoDay) return false;
      if (from && expense.date < from) return false;
      if (to && expense.date > to) return false;
      return true;
    });
    return list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  }, [project.expenses, status, method, accountKey, selectedDay, from, to]);

  const summary = React.useMemo(() => summarizeExpenses(filtered, { from, to }), [filtered, from, to]);
  const hasFilters = status !== 'all' || method !== 'all' || accountKey !== 'all' || dayId !== 'all' || !!from || !!to;

  const clearFilters = () => {
    setStatus('all');
    setMethod('all');
    setAccountKey('all');
    setDayId('all');
    setFrom('');
    setTo('');
  };

  const addExpense = () => {
    const expense = makeExpense({
      date: selectedDay?.date || isoToday(),
      dayDate: selectedDay?.date,
      dayNumber: selectedDay?.chronoDay,
    });
    dispatch({ type: 'ADD_EXPENSE', payload: expense });
    setEditingId(expense.id);
  };

  const duplicateExpense = (expense: Expense) => {
    dispatch({
      type: 'ADD_EXPENSE',
      payload: {
        ...expense,
        id: undefined,
        description: `${expense.description} (copy)`,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
  };

  const deleteExpense = async (expense: Expense) => {
    const ok = await dialog.confirm({
      title: 'Delete this expense?',
      message: `“${expense.description}” will be removed from the cost report. Undo is available.`,
      danger: true,
      suppressKey: 'lemon_schedule_expense_delete',
    });
    if (ok) dispatch({ type: 'DELETE_EXPENSE', payload: expense.id });
  };

  const commit = (commits: ExpenseGridCommit[]) => {
    dispatch({ type: 'BATCH_START' });
    try {
      for (const item of commits) {
        if (Object.keys(item.updates).length === 0) continue;
        dispatch({ type: 'UPDATE_EXPENSE', payload: { id: item.id, updates: item.updates } });
      }
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const { expenses, skipped } = parseExpensesCsv(text, project);
    if (expenses.length === 0) {
      await dialog.alert({ title: 'No expenses found', message: 'The CSV needs a header row with at least Date, Description and Amount.' });
      return;
    }
    const ok = await dialog.confirm({
      title: `Import ${expenses.length} expense${expenses.length === 1 ? '' : 's'}?`,
      message: `${skipped > 0 ? `${skipped} row${skipped === 1 ? '' : 's'} skipped. ` : ''}Account and PO names match the existing budget; unmatched rows stay Unallocated. Undo is available.`,
    });
    if (!ok) return;
    dispatch({ type: 'BULK_ADD_EXPENSES', payload: expenses });
  };

  const accountLabel = accountKey === 'all'
    ? 'All accounts'
    : accountKey === 'none'
      ? 'Unallocated'
      : (() => {
        const account = accounts.find(a => a.id === accountKey);
        return account ? `${account.number} ${account.name}`.trim() : 'Account';
      })();
  const dayLabel = selectedDay ? `DAY ${selectedDay.chronoDay} · ${formatDateShort(selectedDay.date)}` : 'All days';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--ui-modal-header-base)]" data-expenses-view>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0 flex-wrap">
        <DateField
          value={from ? [from] : []}
          onChange={dates => setFrom(dates[dates.length - 1] || '')}
          placeholder="From"
          initialView={from || isoToday()}
          triggerClassName={LIGHT_TRIGGER}
        />
        <span className="text-[10px] text-[color:var(--ui-text-faint)]">–</span>
        <DateField
          value={to ? [to] : []}
          onChange={dates => setTo(dates[dates.length - 1] || '')}
          placeholder="To"
          initialView={to || isoToday()}
          triggerClassName={LIGHT_TRIGGER}
        />
        <DropdownMenu
          open={statusOpen}
          onOpenChange={setStatusOpen}
          width="w-44"
          theme="light"
          trigger={<Button theme="light">{status === 'all' ? 'All statuses' : EXPENSE_STATUS_LABELS[status]}<ChevronDown className="w-3 h-3" /></Button>}
        >
          <DropdownItem onClick={() => { setStatusOpen(false); setStatus('all'); }} icon={status === 'all' ? <span className="text-[10px]">✓</span> : undefined}>All statuses</DropdownItem>
          <DropdownDivider />
          {EXPENSE_STATUSES.map(key => (
            <DropdownItem key={key} onClick={() => { setStatusOpen(false); setStatus(key); }} icon={status === key ? <span className="text-[10px]">✓</span> : undefined}>
              {EXPENSE_STATUS_LABELS[key]}
            </DropdownItem>
          ))}
        </DropdownMenu>
        <DropdownMenu
          open={methodOpen}
          onOpenChange={setMethodOpen}
          width="w-44"
          theme="light"
          trigger={<Button theme="light">{method === 'all' ? 'All methods' : EXPENSE_METHOD_LABELS[method]}<ChevronDown className="w-3 h-3" /></Button>}
        >
          <DropdownItem onClick={() => { setMethodOpen(false); setMethod('all'); }} icon={method === 'all' ? <span className="text-[10px]">✓</span> : undefined}>All methods</DropdownItem>
          <DropdownDivider />
          {EXPENSE_METHODS.map(key => (
            <DropdownItem key={key} onClick={() => { setMethodOpen(false); setMethod(key); }} icon={method === key ? <span className="text-[10px]">✓</span> : undefined}>
              {EXPENSE_METHOD_LABELS[key]}
            </DropdownItem>
          ))}
        </DropdownMenu>
        <DropdownMenu
          open={accountOpen}
          onOpenChange={setAccountOpen}
          width="w-72"
          theme="light"
          searchable
          searchPlaceholder="Search accounts…"
          trigger={<Button theme="light"><span className="max-w-[160px] truncate">{accountLabel}</span><ChevronDown className="w-3 h-3" /></Button>}
        >
          <DropdownItem onClick={() => { setAccountOpen(false); setAccountKey('all'); }} icon={accountKey === 'all' ? <span className="text-[10px]">✓</span> : undefined} group="All">All accounts</DropdownItem>
          <DropdownItem onClick={() => { setAccountOpen(false); setAccountKey('none'); }} icon={accountKey === 'none' ? <span className="text-[10px]">✓</span> : undefined} group="All">Unallocated</DropdownItem>
          {accounts.map(account => {
            const category = categories.find(c => c.id === account.categoryId);
            return (
              <DropdownItem
                key={account.id}
                group={category ? `${category.number} ${category.name}`.trim() : 'Accounts'}
                onClick={() => { setAccountOpen(false); setAccountKey(account.id); }}
                icon={accountKey === account.id ? <span className="text-[10px]">✓</span> : undefined}
              >
                {account.number} {account.name}
              </DropdownItem>
            );
          })}
        </DropdownMenu>
        <DropdownMenu
          open={dayOpen}
          onOpenChange={setDayOpen}
          width="w-64"
          theme="light"
          searchable
          searchPlaceholder="Search days…"
          trigger={<Button theme="light"><span className="max-w-[160px] truncate">{dayLabel}</span><ChevronDown className="w-3 h-3" /></Button>}
        >
          <DropdownItem onClick={() => { setDayOpen(false); setDayId('all'); }} icon={dayId === 'all' ? <span className="text-[10px]">✓</span> : undefined}>All days</DropdownItem>
          <DropdownDivider />
          {days.map(day => (
            <DropdownItem
              key={String(day.sectionIndex)}
              onClick={() => { setDayOpen(false); setDayId(String(day.sectionIndex)); }}
              icon={dayId === String(day.sectionIndex) ? <span className="text-[10px]">✓</span> : undefined}
            >
              DAY {day.chronoDay} · {formatDateShort(day.date)}
            </DropdownItem>
          ))}
        </DropdownMenu>
        {hasFilters && (
          <Button variant="subtle" theme="light" onClick={clearFilters} title="Clear filters">
            <RotateCcw className="w-3 h-3" /> Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button theme="light" onClick={addExpense} disabled={readOnly}>
            <Plus className="w-3.5 h-3.5" /> Add expense
          </Button>
          <Button theme="light" onClick={() => fileRef.current?.click()} disabled={readOnly}>
            <FileUp className="w-3.5 h-3.5" /> Import CSV
          </Button>
          <Button theme="light" onClick={() => downloadExpensesCsv(project)}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importCsv(file);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0">
        <SectionTile label="Actual" value={formatMoney(summary.actualCents, settings)} />
        <SectionTile label="Committed" value={formatMoney(summary.committedCents, settings)} tone="muted" />
        <SectionTile label="Petty cash" value={formatMoney(summary.pettyCashCents, settings)} tone="muted" />
        <SectionTile label="This period" value={formatMoney(summary.periodActualCents, settings)} tone="muted" hint={`${filtered.length} row${filtered.length === 1 ? '' : 's'}`} />
      </div>

      <ExpensesGrid
        project={project}
        expenses={filtered}
        readOnly={readOnly}
        onOpenExpense={expense => setEditingId(expense.id)}
        onDeleteExpense={expense => { void deleteExpense(expense); }}
        onDuplicateExpense={duplicateExpense}
        onCommit={commit}
      />

      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] text-[10px] text-[color:var(--ui-text-muted)] shrink-0">
        <Receipt className="w-3 h-3" />
        <span>{filtered.length} of {project.expenses?.length || 0} expenses</span>
        <span className="ml-auto">Actual <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(summary.actualCents, settings)}</strong></span>
        <span>Committed <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(summary.committedCents, settings)}</strong></span>
        <span>Petty cash <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(summary.pettyCashCents, settings)}</strong></span>
      </div>

      {editingId && (
        <ExpenseModal
          expenseId={editingId}
          project={project}
          dispatch={dispatch}
          readOnly={readOnly}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

export default ExpensesView;
