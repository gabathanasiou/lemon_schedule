import React from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Download, Minus, Printer, Save } from 'lucide-react';
import type { Project, ReportDesign } from '../../types';
import type { BudgetModel } from '../../lib/budget/calc';
import type { CostAccountNode, CostCategoryNode, CostRow } from '../../lib/budget/costReport';
import { computeCostReport } from '../../lib/budget/costReport';
import { isoToday } from '../../lib/budget/model';
import { PERIOD_LABELS, periodRange, periodLabel, type PeriodKey } from '../../lib/budget/period';
import { formatMoney, formatPercent } from '../../lib/budget/format';
import { costReportFilename, downloadFile, exportCostReportCsv } from '../../lib/budget/export';
import { costReportDesign } from '../../lib/budget/reportTemplates';
import { useProject } from '../../store';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import DateField from '../DateField';
import { BudgetInput, MoneyField } from './fields';
import { SectionTile } from './SectionTile';

function VarianceCell({ cents, settings }: { cents: number; settings: Parameters<typeof formatMoney>[1] }) {
  if (cents === 0) return <span className="text-[color:var(--ui-text-muted)]">{formatMoney(0, settings)}</span>;
  if (cents > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-700" title="Under budget">
        <ArrowDownRight className="w-3 h-3 shrink-0" />
        {formatMoney(cents, settings)}
        <span className="text-[9px] font-medium">under</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-red-600" title="Over budget">
      <ArrowUpRight className="w-3 h-3 shrink-0" />
      {formatMoney(cents, settings)}
      <span className="text-[9px] font-medium">over</span>
    </span>
  );
}

function MoneyCell({ cents, settings, muted }: { cents: number; settings: Parameters<typeof formatMoney>[1]; muted?: boolean }) {
  return (
    <span className={muted ? 'text-[color:var(--ui-text-muted)]' : undefined}>
      {formatMoney(cents, settings)}
    </span>
  );
}

/**
 * Cost Report (roadmap 334 phase 2): Budget vs Actual/Committed/ETC/EFC/
 * Variance on one read model (`computeCostReport`). As-of + period narrow the
 * displayed Actual; EFC, variance and % used always stay as-of. ETC and its
 * reason are editable inline per budget line (commits on blur → UPDATE_BUDGET_LINE).
 */
export function CostReportView({
  model, project, readOnly, onPrintDesign,
}: {
  model: BudgetModel;
  project: Project;
  readOnly: boolean;
  onPrintDesign?: (design: ReportDesign) => void;
}) {
  const { dispatch } = useProject();
  const [asOf, setAsOf] = React.useState(() => isoToday());
  const [period, setPeriod] = React.useState<PeriodKey>('all');
  const [customFrom, setCustomFrom] = React.useState('');
  const [customTo, setCustomTo] = React.useState('');
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(
    () => new Set(model.categories.map(c => c.category.id)),
  );
  const [expandedAccounts, setExpandedAccounts] = React.useState<Set<string>>(new Set());

  const range = period === 'custom'
    ? { from: customFrom || undefined, to: customTo || undefined }
    : periodRange(period, asOf);

  const report = React.useMemo(
    () => computeCostReport(project, { asOf, from: range.from, to: range.to, budget: model }),
    [project, asOf, range.from, range.to, model],
  );
  const settings = report?.settings || model.settings;

  const toggleCategory = (id: string) => setExpandedCategories(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAccount = (id: string) => setExpandedAccounts(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const setEtc = (lineId: string, cents: number) => {
    dispatch({ type: 'UPDATE_BUDGET_LINE', payload: { id: lineId, updates: { etcCents: cents } } });
  };

  const clearEtc = (lineId: string) => {
    dispatch({ type: 'UPDATE_BUDGET_LINE', payload: { id: lineId, updates: { etcCents: undefined } } });
  };

  const setReason = (lineId: string, reason: string) => {
    dispatch({ type: 'UPDATE_BUDGET_LINE', payload: { id: lineId, updates: { etcReason: reason || undefined } } });
  };

  const printDesign = () => {
    if (onPrintDesign) onPrintDesign(costReportDesign());
  };

  const saveDesign = () => {
    const design = costReportDesign();
    dispatch({ type: 'ADD_REPORT_DESIGN', payload: { name: design.name, blocks: design.blocks, page: design.page, header: design.header, footer: design.footer } });
  };

  const totals = report?.totals;
  const periodText = periodLabel(period, customFrom, customTo);

  const columnCount = 9;
  const lineCellPad = 'px-2 py-1';

  const renderLine = (row: CostRow) => {
    const lineId = row.lineId;
    return (
      <tr key={row.key} className="border-b border-[color:var(--ui-border)] hover:bg-[var(--ui-item-hover-bg)]">
        <td className={`${lineCellPad} text-[color:var(--ui-text-strong)]`} style={{ paddingLeft: 38 }}>{row.name}</td>
        <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.budgetCents} settings={settings} /></td>
        <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.actualCents} settings={settings} /></td>
        <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.committedCents} settings={settings} /></td>
        <td className={lineCellPad}>
          {readOnly || !lineId ? (
            <div className="text-right tabular-nums">{formatMoney(row.etcCents, settings)}</div>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <div className="w-24">
                <MoneyField cents={row.etcCents} onCommit={cents => setEtc(lineId, cents)} readOnly={readOnly} ariaLabel={`ETC for ${row.name}`} />
              </div>
              {row.etcOverride && (
                <button
                  type="button"
                  onClick={() => clearEtc(lineId)}
                  title="Use the automatic ETC (budget − actual − committed)"
                  className="text-[9px] text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text-strong)]"
                >
                  Auto
                </button>
              )}
            </div>
          )}
        </td>
        <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.efcCents} settings={settings} /></td>
        <td className={`${lineCellPad} text-right tabular-nums`}><VarianceCell cents={row.varianceCents} settings={settings} /></td>
        <td className={`${lineCellPad} text-right tabular-nums`}>{formatPercent(row.percentUsed, 1)}</td>
        <td className={lineCellPad}>
          {readOnly || !lineId ? (
            <span className="text-[color:var(--ui-text-muted)]">{row.etcReason || ''}</span>
          ) : (
            <BudgetInput value={row.etcReason || ''} onCommit={v => setReason(lineId, v)} readOnly={readOnly} placeholder="Reason" />
          )}
        </td>
      </tr>
    );
  };

  const renderAccount = (cat: CostCategoryNode, account: CostAccountNode) => {
    const row = account.row;
    const expanded = expandedAccounts.has(account.accountId);
    return (
      <React.Fragment key={account.accountId}>
        <tr className="border-b border-[color:var(--ui-border)] bg-[#f6f6f7] font-semibold text-[#3f3f46]">
          <td className={lineCellPad}>
            <button
              type="button"
              onClick={() => toggleAccount(account.accountId)}
              className="flex w-full items-center gap-1 text-left"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
              <span className="tabular-nums">{account.number}</span>
              <span className="truncate">{account.name}</span>
            </button>
          </td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.budgetCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.actualCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.committedCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.etcCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.efcCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><VarianceCell cents={row.varianceCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}>{formatPercent(row.percentUsed, 1)}</td>
          <td className={lineCellPad} />
        </tr>
        {expanded && (
          <>
            {account.lines.map(line => renderLine(line))}
            {account.unallocated && (
              <tr key={account.unallocated.key} className="border-b border-[color:var(--ui-border)] italic text-[color:var(--ui-text-muted)]">
                <td className={`${lineCellPad}`} style={{ paddingLeft: 38 }}>Unallocated</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(account.unallocated.budgetCents, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(account.unallocated.actualCents, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(account.unallocated.committedCents, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(account.unallocated.etcCents, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(account.unallocated.efcCents, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}><VarianceCell cents={account.unallocated.varianceCents} settings={settings} /></td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatPercent(account.unallocated.percentUsed, 1)}</td>
                <td className={lineCellPad} />
              </tr>
            )}
          </>
        )}
      </React.Fragment>
    );
  };

  const renderCategory = (cat: CostCategoryNode) => {
    const row = cat.row;
    const expanded = expandedCategories.has(cat.categoryId);
    return (
      <React.Fragment key={cat.categoryId}>
        <tr className="border-b border-[color:var(--ui-border)] bg-[#e8e8ea] font-semibold text-[#18181b]">
          <td className={lineCellPad}>
            <button
              type="button"
              onClick={() => toggleCategory(cat.categoryId)}
              className="flex w-full items-center gap-1 text-left"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
              <span className="tabular-nums">{cat.number}</span>
              <span className="truncate">{cat.name}</span>
              {!cat.inBudget && <span className="ml-1 text-[9px] font-normal text-[color:var(--ui-text-faint)]">Not in budget</span>}
            </button>
          </td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.budgetCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.actualCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.committedCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.etcCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><MoneyCell cents={row.efcCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}><VarianceCell cents={row.varianceCents} settings={settings} /></td>
          <td className={`${lineCellPad} text-right tabular-nums`}>{formatPercent(row.percentUsed, 1)}</td>
          <td className={lineCellPad} />
        </tr>
        {expanded && cat.accounts.map(account => renderAccount(cat, account))}
      </React.Fragment>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--ui-modal-header-base)]" data-cost-report>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">As of</span>
        <DateField
          value={[asOf]}
          onChange={dates => { if (dates.length) setAsOf(dates[dates.length - 1]); }}
          placeholder="Today"
          initialView={asOf}
          triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border-strong)] rounded text-xs text-[color:var(--ui-text)] hover:bg-[var(--ui-card-hover)]"
        />
        <DropdownMenu
          open={periodOpen}
          onOpenChange={setPeriodOpen}
          width="w-44"
          theme="light"
          trigger={<Button theme="light"><span className="truncate">{periodText}</span></Button>}
        >
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map(key => (
            <DropdownItem
              key={key}
              onClick={() => { setPeriodOpen(false); setPeriod(key); }}
              icon={key === period ? <span className="text-[10px]">✓</span> : undefined}
            >
              {PERIOD_LABELS[key]}
            </DropdownItem>
          ))}
        </DropdownMenu>
        {period === 'custom' && (
          <>
            <DateField
              value={customFrom ? [customFrom] : []}
              onChange={dates => setCustomFrom(dates[dates.length - 1] || '')}
              placeholder="From"
              initialView={asOf}
              triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border-strong)] rounded text-xs text-[color:var(--ui-text)] hover:bg-[var(--ui-card-hover)]"
            />
            <span className="text-[10px] text-[color:var(--ui-text-faint)]">–</span>
            <DateField
              value={customTo ? [customTo] : []}
              onChange={dates => setCustomTo(dates[dates.length - 1] || '')}
              placeholder="To"
              initialView={asOf}
              triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border-strong)] rounded text-xs text-[color:var(--ui-text)] hover:bg-[var(--ui-card-hover)]"
            />
          </>
        )}
        <span className="text-[10px] text-[color:var(--ui-text-faint)]">
          {report?.periodApplied ? 'Actual is the selected period · EFC stays as-of' : `${report?.expenseCount || 0} expenses · ${report?.purchaseOrderCount || 0} POs`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onPrintDesign && (
            <DropdownMenu
              open={printOpen}
              onOpenChange={setPrintOpen}
              width="w-56"
              theme="light"
              trigger={<Button theme="light"><Printer className="w-3.5 h-3.5" /> Print</Button>}
            >
              <DropdownItem onClick={() => { setPrintOpen(false); printDesign(); }}>Print Cost Report</DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => { setPrintOpen(false); saveDesign(); }}>
                <span className="inline-flex items-center gap-1"><Save className="w-3 h-3" /> Save as design</span>
              </DropdownItem>
            </DropdownMenu>
          )}
          <Button
            theme="light"
            onClick={() => report && downloadFile(exportCostReportCsv(report), costReportFilename(project), 'text/csv')}
            disabled={!report}
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0">
        <SectionTile label="Budget" value={formatMoney(totals?.budgetCents || 0, settings)} />
        <SectionTile label="Actual" value={formatMoney(totals?.actualCents || 0, settings)} tone="muted" />
        <SectionTile label="Committed" value={formatMoney(totals?.committedCents || 0, settings)} tone="muted" />
        <SectionTile label="EFC" value={formatMoney(totals?.efcCents || 0, settings)} />
        <SectionTile
          label="Variance"
          value={formatMoney(totals?.varianceCents || 0, settings)}
          tone={(totals?.varianceCents || 0) < 0 ? 'bad' : 'good'}
          hint={(totals?.varianceCents || 0) < 0 ? 'over' : 'under'}
          icon={(totals?.varianceCents || 0) < 0
            ? <ArrowUpRight className="w-3 h-3" />
            : (totals?.varianceCents || 0) > 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        />
        <SectionTile label="% Used" value={formatPercent(totals?.percentUsed || 0, 1)} tone="muted" />
      </div>

      <div className="flex-1 overflow-auto scrollbar-custom min-h-0">
        {!report || report.categories.length === 0 ? (
          <div className="p-10 text-center text-xs text-[color:var(--ui-text-muted)]">No budget categories yet — add lines in the Budget sheet.</div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10 bg-[var(--ui-panel-bg)] text-[9px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">
              <tr className="border-b border-[color:var(--ui-border)]">
                <th className="px-2 py-1.5 text-left font-semibold">Account / Description</th>
                <th className="px-2 py-1.5 text-right font-semibold">Budget</th>
                <th className="px-2 py-1.5 text-right font-semibold">Actual</th>
                <th className="px-2 py-1.5 text-right font-semibold">Committed</th>
                <th className="px-2 py-1.5 text-right font-semibold">ETC</th>
                <th className="px-2 py-1.5 text-right font-semibold">EFC</th>
                <th className="px-2 py-1.5 text-right font-semibold">Variance</th>
                <th className="px-2 py-1.5 text-right font-semibold">% Used</th>
                <th className="px-2 py-1.5 text-left font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {report.categories.map(cat => renderCategory(cat))}
              {report.unallocated && (
                <tr className="border-b border-[color:var(--ui-border)] italic text-[color:var(--ui-text-muted)]">
                  <td className={lineCellPad}>Unallocated (project)</td>
                  <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(report.unallocated.budgetCents, settings)}</td>
                  <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(report.unallocated.actualCents, settings)}</td>
                  <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(report.unallocated.committedCents, settings)}</td>
                  <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(report.unallocated.etcCents, settings)}</td>
                  <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(report.unallocated.efcCents, settings)}</td>
                  <td className={`${lineCellPad} text-right tabular-nums`}><VarianceCell cents={report.unallocated.varianceCents} settings={settings} /></td>
                  <td className={`${lineCellPad} text-right tabular-nums`}>{formatPercent(report.unallocated.percentUsed, 1)}</td>
                  <td className={lineCellPad} />
                </tr>
              )}
              <tr className="border-t-2 border-[color:var(--ui-border-strong)] bg-[var(--ui-panel-bg)] font-semibold">
                <td className={lineCellPad}>Grand total</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(totals?.budgetCents || 0, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(totals?.actualCents || 0, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(totals?.committedCents || 0, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(totals?.etcCents || 0, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatMoney(totals?.efcCents || 0, settings)}</td>
                <td className={`${lineCellPad} text-right tabular-nums`}><VarianceCell cents={totals?.varianceCents || 0} settings={settings} /></td>
                <td className={`${lineCellPad} text-right tabular-nums`}>{formatPercent(totals?.percentUsed || 0, 1)}</td>
                <td className={lineCellPad} />
              </tr>
            </tbody>
          </table>
        )}
      </div>
      {model.lineCount === 0 && report && (
        <div className="px-3 py-1.5 border-t border-[color:var(--ui-border)] text-[10px] text-[color:var(--ui-text-faint)] shrink-0">
          No budget lines yet — ETC defaults to zero until a line exists. Account-level expenses roll into Unallocated.
        </div>
      )}
    </div>
  );
}

export default CostReportView;
