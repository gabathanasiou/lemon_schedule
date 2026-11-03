import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { BudgetModel } from '../../lib/budget/calc';
import type { CostReportModel } from '../../lib/budget/costReport';
import { formatMoney, formatPercent } from '../../lib/budget/format';
import { SectionTile } from './SectionTile';

/**
 * The Budget page's KPI strip (roadmap 349). Budget mode shows the authored
 * totals; Cost Report mode swaps to the cost read model's Budget/Actual/
 * Committed/EFC/Variance/% used. Both are `computeBudget`-derived — no maths
 * here beyond formatting.
 */
export function BudgetKpis({
  mode, model, report,
}: {
  mode: 'budget' | 'cost';
  model: BudgetModel;
  report: CostReportModel | null;
}) {
  const settings = report?.settings || model.settings;
  if (mode === 'cost') {
    const totals = report?.totals;
    const variance = totals?.varianceCents || 0;
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0">
        <SectionTile label="Budget" value={formatMoney(totals?.budgetCents || 0, settings)} />
        <SectionTile label="Actual" value={formatMoney(totals?.actualCents || 0, settings)} tone="muted" />
        <SectionTile label="Committed" value={formatMoney(totals?.committedCents || 0, settings)} tone="muted" />
        <SectionTile label="EFC" value={formatMoney(totals?.efcCents || 0, settings)} />
        <SectionTile
          label="Variance"
          value={formatMoney(variance, settings)}
          tone={variance < 0 ? 'bad' : 'good'}
          hint={variance < 0 ? 'over' : 'under'}
          icon={variance < 0
            ? <ArrowUpRight className="w-3 h-3" />
            : variance > 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        />
        <SectionTile label="% Used" value={formatPercent(totals?.percentUsed || 0, 1)} tone="muted" />
      </div>
    );
  }

  const totals = model.totals;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0">
      <SectionTile label="Grand total" value={formatMoney(totals.grandTotalCents, settings)} />
      <SectionTile label="ATL" value={formatMoney(totals.byGroup.atl, settings)} tone="muted" />
      <SectionTile label="BTL" value={formatMoney(totals.byGroup.btl, settings)} tone="muted" />
      <SectionTile label="Post" value={formatMoney(totals.byGroup.post, settings)} tone="muted" />
      <SectionTile label="Fringes" value={formatMoney(totals.fringeCents, settings)} tone="muted" />
      <SectionTile label="Contingency" value={formatMoney(totals.markupCents, settings)} tone="muted" />
    </div>
  );
}
