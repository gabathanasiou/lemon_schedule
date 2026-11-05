import React, { useMemo } from 'react';
import { BadgeDollarSign, Clock, TriangleAlert } from 'lucide-react';
import type { DayOvertime, OvertimePolicy } from '../../../../types';
import type { DaySectionProps } from '../daySectionTypes';
import { computeDayOvertime, overtimeDayFromView, overtimeExpensesForDay, resolveOvertimePolicy } from '../../../../lib/budget/overtime';
import { formatMoney } from '../../../../lib/budget/format';
import InlineGlideTable, { type InlineGlideColumn } from '../../../InlineGlideTable';
import { textCell } from '../../../../lib/glideCells';
import Button from '../../../Button';
import TimeField from '../../../TimeField';
import { useDialog } from '../../../Dialog';

/**
 * Item 358 — the Day Manager's Overtime section. Policy lives in Budget →
 * Library (project-wide, crew + cast); this section records the day's ACTUAL
 * call/wrap and shows the per-person hours/cost the engine derives. Posting
 * turns the cost into actual payroll expenses in one batch.
 *
 * The old Crew-card modal is gone: the same data is a normal Day Manager
 * section, and the cost outcome stays in the Cost Report.
 */

const EMPTY = new Set<string>();

function hoursLabel(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

const COLUMNS: InlineGlideColumn[] = [
  { key: 'name', label: 'Name', width: 200 },
  { key: 'role', label: 'Role', width: 150 },
  { key: 'dept', label: 'Dept', width: 120 },
  { key: 'call', label: 'Call', width: 78, align: 'center' },
  { key: 'wrap', label: 'Wrap', width: 78, align: 'center' },
  { key: 'hours', label: 'Hours', width: 68, align: 'right' },
  { key: 'ot', label: 'OT h', width: 62, align: 'right' },
  { key: 'cost', label: 'OT cost', width: 100, align: 'right' },
];

const OvertimeGrid: React.FC<{
  title: string;
  rows: ReturnType<typeof overtimeRowsOf>;
  presenceScope: string;
  emptyLabel: string;
}> = ({ title, rows, presenceScope, emptyLabel }) => {
  const getCellContent = React.useCallback((col: InlineGlideColumn, row: Record<string, string>) => {
    if (col.key === 'cost') {
      return textCell(row.cost, {
        readonly: true,
        allowOverlay: false,
        align: 'right',
        themeOverride: row.noRate === '1' ? { textDark: '#b45309', textMedium: '#b45309', textLight: '#b45309' } : undefined,
      });
    }
    if (col.key === 'hours' || col.key === 'ot') {
      return textCell(row[col.key] || '', { readonly: true, allowOverlay: false, align: 'right' });
    }
    if (col.key === 'call' || col.key === 'wrap') {
      return textCell(row[col.key] || '', { readonly: true, allowOverlay: false, align: 'center', themeOverride: { textDark: '#52525b' } });
    }
    return textCell(row[col.key] || '', { readonly: true, allowOverlay: false });
  }, []);
  return (
    <div className="rounded-lg border border-[color:var(--ui-border)] overflow-hidden bg-[var(--ui-panel-bg)]" data-overtime-grid={title}>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--ui-card-band)] border-b border-[color:var(--ui-border)]">
        <span className="text-[11px] font-semibold text-[color:var(--ui-text)]">{title}</span>
        <span className="text-[10px] text-[color:var(--ui-text-faint)]">{rows.length}</span>
      </div>
      <InlineGlideTable
        dataAttr="data-overtime-glide"
        columns={COLUMNS}
        rows={rows}
        getCellContent={getCellContent}
        onCommit={() => {}}
        editableKeys={EMPTY}
        readOnly
        presenceScope={presenceScope}
        emptyLabel={emptyLabel}
      />
    </div>
  );
};

function overtimeRowsOf(rows: ReturnType<typeof computeDayOvertime>['crew'], settings: Parameters<typeof formatMoney>[1]) {
  return rows.map(row => ({
    key: row.id,
    name: row.name,
    role: row.role,
    dept: row.department || '',
    call: row.callTime || '',
    wrap: row.wrapTime || '',
    hours: row.hours.toFixed(row.hours % 1 === 0 ? 0 : 2),
    ot: row.otHours.toFixed(row.otHours % 1 === 0 ? 0 : 2),
    cost: row.noRate ? 'No rate' : formatMoney(row.otCostCents, settings),
    noRate: row.noRate ? '1' : '',
    rate: row.rateCents != null ? formatMoney(row.rateCents, settings) : '',
    unit: row.rateUnit || '',
  }));
}

const OvertimeSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly, dispatch }) => {
  const dialog = useDialog();
  const settings = project.budget?.settings;
  const input = useMemo(() => overtimeDayFromView(project, day), [project, day]);
  const result = useMemo(() => computeDayOvertime(project, input), [project, input]);
  const overtime: DayOvertime = day.meta.overtime || {};
  const crewPolicy: OvertimePolicy = resolveOvertimePolicy(project, input, undefined, undefined, 'crew');
  const castPolicy: OvertimePolicy = resolveOvertimePolicy(project, input, undefined, undefined, 'cast');

  const patchOt = (patch: Partial<DayOvertime>) => patchMeta({ overtime: { ...overtime, ...patch } });

  const crewRows = useMemo(() => overtimeRowsOf(result.crew, settings), [result.crew, settings]);
  const castRows = useMemo(() => overtimeRowsOf(result.cast, settings), [result.cast, settings]);

  const postExpenses = async () => {
    const expenses = overtimeExpensesForDay(project, input, result);
    if (expenses.length === 0) return;
    const ok = await dialog.confirm({
      title: `Post ${expenses.length} overtime expense${expenses.length === 1 ? '' : 's'}?`,
      message: `${formatMoney(result.totalCostCents, settings)} of overtime (${hoursLabel(result.totalOtHours)}) becomes actual payroll spend on ${day.label}. One undo entry.`,
      danger: false,
    });
    if (!ok) return;
    dispatch({ type: 'BATCH_START' });
    try {
      patchOt({ postedAt: new Date().toISOString() });
      dispatch({ type: 'BULK_ADD_EXPENSES', payload: expenses });
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
  };

  return (
    <div className="space-y-3" data-overtime-section>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ui-text-faint)]">Actual call</span>
          <TimeField
            value={overtime.actualCall || ''}
            onChange={v => patchOt({ actualCall: v || undefined })}
            readOnly={readOnly}
            ariaLabel="Actual call"
            placeholder={day.callTime}
            onReset={overtime.actualCall ? () => patchOt({ actualCall: undefined }) : undefined}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ui-text-faint)]">Actual wrap</span>
          <TimeField
            value={overtime.actualWrap || ''}
            onChange={v => patchOt({ actualWrap: v || undefined })}
            readOnly={readOnly}
            ariaLabel="Actual wrap"
            placeholder={day.wrap || '18:00'}
            onReset={overtime.actualWrap ? () => patchOt({ actualWrap: undefined }) : undefined}
          />
        </label>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ui-text-faint)]">Overtime</span>
          <span className="text-xs font-semibold text-[color:var(--ui-text-strong)] tabular-nums">
            {hoursLabel(result.totalOtHours)} · {formatMoney(result.totalCostCents, settings)}
          </span>
        </div>
        <span className="text-[10px] text-[color:var(--ui-text-faint)]">
          Policy: Budget → Library → Overtime ({crewPolicy.dailyHours}h crew · {castPolicy.dailyHours}h cast)
        </span>
        <Button
          variant="subtle"
          className="ml-auto"
          onClick={() => void postExpenses()}
          disabled={readOnly || result.noRate.length > 0 || result.totalCostCents <= 0}
          title="Create actual payroll expenses for this day's overtime"
          data-overtime-post
        >
          <BadgeDollarSign className="w-3.5 h-3.5" /> Post to expenses
        </Button>
      </div>

      {overtime.postedAt && (
        <p className="text-[10px] text-[color:var(--ui-text-faint)]">
          Posted {new Date(overtime.postedAt).toLocaleDateString()} — posting again adds another expense batch.
        </p>
      )}

      {result.noRate.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800" data-overtime-no-rate>
          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>No numeric rate for {result.noRate.join(', ')} — hours are computed, cost is 0. Set a rate in the Crew Manager / cast details.</span>
        </div>
      )}

      <OvertimeGrid title="Crew" rows={crewRows} presenceScope={`day:${day.sectionIndex}:overtime:crew`} emptyLabel="No crew on this day." />
      <OvertimeGrid title="Cast" rows={castRows} presenceScope={`day:${day.sectionIndex}:overtime:cast`} emptyLabel="No cast on this day." />
    </div>
  );
};

export const OvertimeIcon = Clock;

export default OvertimeSection;
