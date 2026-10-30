import React, { useMemo } from 'react';
import { Plus, Wallet } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { expensesOfDay, summarizeExpenses } from '../../../../lib/budget/costReport';
import { makeExpense } from '../../../../lib/budget/model';
import { formatMoney } from '../../../../lib/budget/format';
import { ExpensesGrid } from '../../../budget/ExpensesGrid';
import Button from '../../../Button';
import { useDialog } from '../../../Dialog';

/**
 * Day Manager → Expenses (roadmap 334 phase 2, Glide in roadmap 336). Expenses
 * are PROJECT state; this card filters by the day's date/chrono number — it
 * never stores a ledger in `daybreakMeta`. Fast entry runs through the SAME
 * `ExpensesGrid` recipe as the Budget ledger: commit-on-blur cells, a
 * persistent trash lane and (i) → the shared `ExpenseModal` (root-owned by
 * `DayManagerPage`, `actions.openExpense`). **Add expense** lands an editable
 * row WITHOUT opening the modal.
 */
const ExpensesSection: React.FC<DaySectionProps> = ({ day, project, dispatch, actions, readOnly }) => {
  const dialog = useDialog();
  const expenses = useMemo(() => expensesOfDay(project, { date: day.date, chronoDay: day.chronoDay }), [project, day.date, day.chronoDay]);
  const summary = useMemo(() => summarizeExpenses(expenses), [expenses]);
  const settings = project.budget?.settings;
  const hasBudget = !!project.budget;

  const openExpense = (id?: string) => actions.openExpense?.(id);

  /** Modal-less quick add: the new row is immediately editable in the grid. */
  const quickAdd = () => {
    dispatch({
      type: 'ADD_EXPENSE',
      payload: makeExpense({ date: day.date, dayDate: day.date, dayNumber: day.chronoDay, description: 'New expense' }),
    });
  };

  const duplicate = (source: (typeof expenses)[number]) => {
    dispatch({
      type: 'ADD_EXPENSE',
      payload: makeExpense({
        ...source,
        id: undefined,
        description: `${source.description} (copy)`,
        date: day.date,
        dayDate: day.date,
        dayNumber: day.chronoDay,
      }),
    });
  };

  const confirmDelete = async (id: string) => {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    const ok = await dialog.confirm({
      title: 'Delete expense?',
      message: `“${expense.description}” will be removed. Undo is available.`,
      danger: true,
      suppressKey: 'lemon_schedule_expense_delete',
    });
    if (ok) dispatch({ type: 'DELETE_EXPENSE', payload: id });
  };

  return (
    <div className="space-y-2" data-expenses-section>
      {!hasBudget && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-[color:var(--ui-border-strong)] bg-[var(--ui-card-bg)] px-3 py-2.5">
          <Wallet className="w-4 h-4 text-[color:var(--ui-text-faint)] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[color:var(--ui-text-strong)]">Create a budget to track this day&apos;s costs</p>
            <p className="text-[11px] text-[color:var(--ui-text-muted)]">Expenses stay unallocated until a budget exists; the cost report needs the account chart.</p>
          </div>
          <Button variant="subtle" onClick={() => actions.openBudget?.()} disabled={readOnly}>
            Create a budget
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-[color:var(--ui-text-muted)] flex-1">
          {expenses.length > 0
            ? `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`
            : 'No expenses attributed to this day yet'}
        </span>
        <Button variant="subtle" onClick={quickAdd} disabled={readOnly}>
          <Plus className="w-3 h-3" /> Add expense
        </Button>
      </div>

      <div className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-card-bg)] overflow-hidden">
        <ExpensesGrid
          project={project}
          expenses={expenses}
          readOnly={!!readOnly}
          fill={false}
          presenceScope={`day:${day.chronoDay}:expenses`}
          emptyLabel="No expenses attributed to this day yet — Add expense, or tag one with this date."
          onOpenExpense={(expense) => openExpense(expense.id)}
          onDeleteExpense={(expense) => { void confirmDelete(expense.id); }}
          onDuplicateExpense={duplicate}
          onCommit={(commits) => {
            dispatch({ type: 'BATCH_START' });
            try {
              for (const commit of commits) dispatch({ type: 'UPDATE_EXPENSE', payload: { id: commit.id, updates: commit.updates } });
            } finally {
              dispatch({ type: 'BATCH_COMMIT' });
            }
          }}
        />
      </div>

      {expenses.length > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-[color:var(--ui-text-muted)]">
          <span>Actual <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(summary.actualCents, settings)}</strong></span>
          <span>Committed <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(summary.committedCents, settings)}</strong></span>
          {summary.pettyCashCents > 0 && <span>Petty cash <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(summary.pettyCashCents, settings)}</strong></span>}
        </div>
      )}
    </div>
  );
};

export default ExpensesSection;
