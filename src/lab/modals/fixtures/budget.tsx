import React, { useMemo } from 'react';
import type { FixtureContext, SurfaceRender } from '../types';
import { meta } from '../surfaces/budget';
import { BudgetGlobalModal } from '../../../components/budget/BudgetGlobalModal';
import { BudgetGroupModal } from '../../../components/budget/BudgetGroupModal';
import { BudgetLineModal } from '../../../components/budget/BudgetLineModal';
import { BudgetNodeModal } from '../../../components/budget/BudgetNodeModal';
import { BudgetTrashModal } from '../../../components/budget/BudgetTrashModal';
import { ExpenseModal } from '../../../components/budget/ExpenseModal';
import { FormulaBookModal } from '../../../components/budget/FormulaBookModal';
import { OvertimePolicyModal } from '../../../components/budget/OvertimePolicyModal';
import { ScheduleReviewModal } from '../../../components/budget/ScheduleReviewModal';
import { activeBudgetVersion, makeBlankBudget, makeBudgetLine, makeExpense } from '../../../lib/budget/model';
import { computeBudget } from '../../../lib/budget/calc';
import { computeScheduleBudgetDiff } from '../../../lib/budget/diff';
import { buildFormulaBook } from '../../../lib/budget/formulaBook';
import type { Budget, BudgetAccount, BudgetCategory, BudgetGlobal, BudgetLine, Project } from '../../../types';

/**
 * Budget group (roadmap 374). The budget editors take a chart/model object, so
 * the fixtures build a LOCAL demo model when the open project has no usable
 * budget (a category, an account and one shoot-days-linked line) and pass a
 * cloned project to the modal. Nothing is written to the store by the fixture
 * itself; edits made inside the real modal use the real callbacks (the line/
 * node tests pass no-ops, as those editors receive their data by props).
 */

type Id = (typeof meta)[number]['id'];

interface BudgetDemo {
  project: Project;
  budget: Budget;
  model: NonNullable<ReturnType<typeof computeBudget>>;
  line: BudgetLine;
  category: BudgetCategory;
  account: BudgetAccount;
}

const DEMO_CATEGORY: BudgetCategory = {
  id: 'studio-category',
  number: '1000',
  name: 'Production',
  group: 'atl',
  sort: 0,
};

const DEMO_ACCOUNT: BudgetAccount = {
  id: 'studio-account',
  categoryId: DEMO_CATEGORY.id,
  number: '1100',
  name: 'Cast',
  sort: 0,
};

function useBudgetDemo(ctx: FixtureContext): BudgetDemo {
  return useMemo(() => {
    const source = ctx.project!;
    const real = source.budget;
    const realVersion = real ? activeBudgetVersion(real) : undefined;
    const realLine = realVersion?.lines[0];
    if (real && realVersion && realLine) {
      const model = computeBudget(source);
      const account = real.accounts.find(a => a.id === realLine.accountId);
      const category = account ? real.categories.find(c => c.id === account.categoryId) : undefined;
      if (model && account && category) {
        return { project: source, budget: real, model, line: realLine, category, account };
      }
    }

    const line = makeBudgetLine({
      accountId: DEMO_ACCOUNT.id,
      description: 'Lead cast — shoot days',
      qty: 1,
      unit: 'unit-flat',
      rateCents: 250000,
      source: { kind: 'shootDays' },
    });
    const budget = makeBlankBudget('Studio demo', {
      categories: [DEMO_CATEGORY],
      accounts: [DEMO_ACCOUNT],
      globals: [
        { id: 'studio-global', symbol: 'CONT', description: 'Contingency', formula: '10' },
      ],
    });
    budget.versions[0].lines = [line];
    const demoProject: Project = { ...source, budget };
    const model = computeBudget(demoProject)!;
    return {
      project: demoProject,
      budget,
      model,
      line,
      category: DEMO_CATEGORY,
      account: DEMO_ACCOUNT,
    };
  }, [ctx.project]);
}

function BudgetLineFixture({ ctx }: { ctx: FixtureContext }) {
  const demo = useBudgetDemo(ctx);
  return (
    <BudgetLineModal
      open
      onClose={ctx.close}
      line={demo.line}
      model={demo.model}
      project={demo.project}
      readOnly={false}
      onUpdate={() => {}}
      onDelete={() => {}}
      onDuplicate={() => {}}
      onLink={() => {}}
      onUnlink={() => {}}
      onPin={() => {}}
      onUnpin={() => {}}
    />
  );
}

function BudgetNodeFixture({ ctx }: { ctx: FixtureContext }) {
  const demo = useBudgetDemo(ctx);
  return (
    <BudgetNodeModal
      open
      kind="category"
      category={demo.category}
      account={demo.account}
      readOnly={false}
      onClose={ctx.close}
      onUpdateCategory={() => {}}
      onUpdateAccount={() => {}}
      onDelete={() => {}}
      onAdd={() => {}}
      rollup={{ budgetCents: demo.model.totals.baseCents }}
      settings={demo.model.settings}
    />
  );
}

function BudgetGroupFixture({ ctx }: { ctx: FixtureContext }) {
  const demo = useBudgetDemo(ctx);
  return (
    <BudgetGroupModal
      open
      group={demo.budget.groups[0]}
      readOnly={false}
      onClose={ctx.close}
      onUpdate={() => {}}
      onDelete={() => {}}
    />
  );
}

function BudgetGlobalFixture({ ctx }: { ctx: FixtureContext }) {
  const demo = useBudgetDemo(ctx);
  const global: BudgetGlobal = demo.budget.globals[0] ?? {
    id: 'studio-global',
    symbol: 'CONT',
    description: 'Contingency',
    formula: '10',
  };
  return (
    <BudgetGlobalModal
      open
      global={global}
      globals={demo.budget.globals.length ? demo.budget.globals : [global]}
      systemValues={{}}
      readOnly={false}
      onClose={ctx.close}
      onUpdate={() => {}}
      onDelete={() => {}}
    />
  );
}

function ExpenseFixture({ ctx }: { ctx: FixtureContext }) {
  const demo = useBudgetDemo(ctx);
  const expense = ctx.project!.expenses?.[0] ?? makeExpense({
    description: 'Catering — Day 1',
    vendor: 'Craft Services',
    amountCents: 125000,
    accountId: demo.account.id,
    lineId: demo.line.id,
    dayDate: ctx.picks.dayDate,
    dayNumber: 1,
    notes: 'Breakfast + lunch for the unit.',
  });
  const expenses = ctx.project!.expenses?.length ? ctx.project!.expenses : [expense];
  return (
    <ExpenseModal
      expenseId={expense.id}
      project={{ ...ctx.project!, expenses }}
      dispatch={ctx.dispatch}
      onClose={ctx.close}
    />
  );
}

function ScheduleReviewFixture({ ctx }: { ctx: FixtureContext }) {
  const demo = useBudgetDemo(ctx);
  const diff = computeScheduleBudgetDiff(demo.project, demo.model.version.id, { model: demo.model });
  if (!diff) {
    return <p className="p-6 text-xs text-[color:var(--ui-text-muted)]">This project has no budget model to review.</p>;
  }
  return (
    <ScheduleReviewModal
      open
      onClose={ctx.close}
      project={demo.project}
      diff={diff}
      settings={demo.model.settings}
      readOnly={false}
      onApply={() => ctx.close()}
    />
  );
}

function BudgetTrashFixture({ ctx }: { ctx: FixtureContext }) {
  const demo = useBudgetDemo(ctx);
  const trash = demo.budget.versionTrash?.length
    ? demo.budget.versionTrash
    : [{
        version: { ...demo.budget.versions[0], id: 'studio-trash', name: 'v00 — pre-shoot' },
        deletedAt: Date.now() - 86400000,
      }];
  return (
    <BudgetTrashModal
      open
      onClose={ctx.close}
      trash={trash}
      onRestore={() => ctx.close()}
    />
  );
}

function FormulaBookFixture({ ctx }: { ctx: FixtureContext }) {
  const demo = useBudgetDemo(ctx);
  const entries = buildFormulaBook({}, demo.budget.globals);
  return (
    <FormulaBookModal
      open
      onClose={ctx.close}
      entries={entries}
      onInsert={() => ctx.close()}
    />
  );
}

export const render: Record<Id, SurfaceRender> = {
  'budget-line': ctx => <BudgetLineFixture ctx={ctx} />,
  'budget-node': ctx => <BudgetNodeFixture ctx={ctx} />,
  'budget-group': ctx => <BudgetGroupFixture ctx={ctx} />,
  'budget-global': ctx => <BudgetGlobalFixture ctx={ctx} />,
  expense: ctx => <ExpenseFixture ctx={ctx} />,
  'overtime-policy': ctx => (
    <OvertimePolicyModal
      open
      kind="crew"
      project={ctx.project!}
      readOnly={false}
      onClose={ctx.close}
      onSave={() => ctx.close()}
    />
  ),
  'schedule-review': ctx => <ScheduleReviewFixture ctx={ctx} />,
  'budget-trash': ctx => <BudgetTrashFixture ctx={ctx} />,
  'formula-book': ctx => <FormulaBookFixture ctx={ctx} />,
};
