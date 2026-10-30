import React, { useMemo } from 'react';
import { Plus, Receipt, Wallet } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { expensesOfDay, expenseAccountLabel, summarizeExpenses } from '../../../../lib/budget/costReport';
import { EXPENSE_METHOD_LABELS, EXPENSE_STATUS_LABELS } from '../../../../lib/budget/model';
import { formatMoney } from '../../../../lib/budget/format';
import Button from '../../../Button';

/**
 * Day Manager → Expenses (roadmap 334 phase 2). Expenses are PROJECT state;
 * this card filters by the day's date/chrono number — it never stores a ledger
 * in `daybreakMeta`. The shared ExpenseModal is root-owned by
 * `DayManagerPage` (`actions.openExpense`).
 */
const ExpensesSection: React.FC<DaySectionProps> = ({ day, project, actions, readOnly }) => {
  const expenses = useMemo(() => expensesOfDay(project, { date: day.date, chronoDay: day.chronoDay }), [project, day.date, day.chronoDay]);
  const summary = useMemo(() => summarizeExpenses(expenses), [expenses]);
  const settings = project.budget?.settings;
  const hasBudget = !!project.budget;

  const openExpense = (id?: string) => actions.openExpense?.(id);

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
        <Button variant="subtle" onClick={() => openExpense()} disabled={readOnly}>
          <Plus className="w-3 h-3" /> Add expense
        </Button>
      </div>

      {expenses.length === 0 ? (
        <div className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-5 text-center">
          <Receipt className="w-4 h-4 mx-auto text-[color:var(--ui-text-disabled)]" />
          <p className="text-[11px] text-[color:var(--ui-text-faint)] mt-1.5">
            Expenses added from the Budget tab or a CSV appear here when their day matches this production day.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-card-bg)]">
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-[var(--ui-panel-bg)] text-[9px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">
              <tr className="border-b border-[color:var(--ui-border)]">
                <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                <th className="px-2 py-1.5 text-left font-semibold">Description</th>
                <th className="px-2 py-1.5 text-left font-semibold">Account</th>
                <th className="px-2 py-1.5 text-left font-semibold">Method</th>
                <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(expense => (
                <tr
                  key={expense.id}
                  onClick={() => openExpense(expense.id)}
                  className={`border-b border-[color:var(--ui-border)] last:border-b-0 cursor-pointer hover:bg-[var(--ui-item-hover-bg)] ${expense.status === 'void' ? 'opacity-50 line-through' : ''}`}
                >
                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{expense.date}</td>
                  <td className="px-2 py-1.5 text-[color:var(--ui-text-strong)]">
                    <span className="block truncate max-w-[220px]">{expense.description}</span>
                    {expense.vendor && <span className="block text-[9px] text-[color:var(--ui-text-faint)] truncate max-w-[220px]">{expense.vendor}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-[color:var(--ui-text-muted)] truncate max-w-[180px]">{expenseAccountLabel(project, expense)}</td>
                  <td className="px-2 py-1.5 text-[color:var(--ui-text-muted)]">{EXPENSE_METHOD_LABELS[expense.method] || expense.method}</td>
                  <td className="px-2 py-1.5 text-[color:var(--ui-text-muted)]">{EXPENSE_STATUS_LABELS[expense.status] || expense.status}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-[color:var(--ui-text-strong)]">{formatMoney(expense.amountCents, settings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
