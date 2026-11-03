import React from 'react';
import { Download, Printer, Save } from 'lucide-react';
import type { Project, ReportDesign } from '../../types';
import type { CostReportModel } from '../../lib/budget/costReport';
import { costReportFilename, downloadFile, exportCostReportCsv } from '../../lib/budget/export';
import { costReportDesign } from '../../lib/budget/reportTemplates';
import { PERIOD_LABELS, periodLabel, type PeriodKey } from '../../lib/budget/period';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import DateField from '../DateField';

export interface CostPeriodState {
  asOf: string;
  period: PeriodKey;
  customFrom: string;
  customTo: string;
}

/**
 * The Cost Report mode's toolbar (roadmap 349): as-of/period narrowing, counts,
 * Print via the Reports Designer and CSV. It is a fragment so the Budget page
 * can host it beside the Budget|Cost switch in ONE toolbar row.
 */
export function CostReportToolbar({
  report, project, state, onChange, onPrintDesign, onSaveDesign,
}: {
  report: CostReportModel | null;
  project: Project;
  state: CostPeriodState;
  onChange: (patch: Partial<CostPeriodState>) => void;
  onPrintDesign?: (design: ReportDesign) => void;
  onSaveDesign: () => void;
}) {
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const [printOpen, setPrintOpen] = React.useState(false);
  const periodText = periodLabel(state.period, state.customFrom, state.customTo);

  return (
    <>
      <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">As of</span>
      <DateField
        value={[state.asOf]}
        onChange={dates => { if (dates.length) onChange({ asOf: dates[dates.length - 1] }); }}
        placeholder="Today"
        initialView={state.asOf}
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
            onClick={() => { setPeriodOpen(false); onChange({ period: key }); }}
            icon={key === state.period ? <span className="text-[10px]">✓</span> : undefined}
          >
            {PERIOD_LABELS[key]}
          </DropdownItem>
        ))}
      </DropdownMenu>
      {state.period === 'custom' && (
        <>
          <DateField
            value={state.customFrom ? [state.customFrom] : []}
            onChange={dates => onChange({ customFrom: dates[dates.length - 1] || '' })}
            placeholder="From"
            initialView={state.asOf}
            triggerClassName="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border-strong)] rounded text-xs text-[color:var(--ui-text)] hover:bg-[var(--ui-card-hover)]"
          />
          <span className="text-[10px] text-[color:var(--ui-text-faint)]">–</span>
          <DateField
            value={state.customTo ? [state.customTo] : []}
            onChange={dates => onChange({ customTo: dates[dates.length - 1] || '' })}
            placeholder="To"
            initialView={state.asOf}
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
            <DropdownItem onClick={() => { setPrintOpen(false); onPrintDesign(costReportDesign()); }}>Print Cost Report</DropdownItem>
            <DropdownDivider />
            <DropdownItem onClick={() => { setPrintOpen(false); onSaveDesign(); }}>
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
    </>
  );
}
