import React from 'react';
import { BadgeDollarSign, Clock, Plus, Trash2, TriangleAlert, Users } from 'lucide-react';
import { Seg } from '@gabriel/ui-kit';
import type { DayMeta, Expense, OvertimeOverride, OvertimePolicy, OvertimeTier, Project } from '../../../types';
import type { DayView } from '../../../lib/dayView';
import {
  computeDayOvertime, overtimeDayFromView, overtimeExpensesForDay,
  resolveOvertimePolicy, type OvertimeRow,
} from '../../../lib/budget/overtime';
import { formatMoney } from '../../../lib/budget/format';
import Modal, { ModalFooter } from '../../Modal';
import ModalFooterButton from '../../ModalFooterButton';
import Button from '../../Button';
import { NumberField } from '../../budget/fields';
import TimeField from '../../TimeField';
import { useDialog } from '../../Dialog';
import type { Action } from '../../../store/reducer';

export type OvertimeTab = 'day' | 'departments' | 'crew' | 'cast';

const TABS: { v: OvertimeTab; l: string }[] = [
  { v: 'day', l: 'Day' },
  { v: 'departments', l: 'Departments' },
  { v: 'crew', l: 'Crew' },
  { v: 'cast', l: 'Cast' },
];

function hoursLabel(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{children}</h3>;
}

/** One override slot for a department or person (merged into DayMeta.overtime). */
function OverrideFields({
  override, readOnly, onPatch,
}: {
  override: OvertimeOverride | undefined;
  readOnly: boolean;
  onPatch: (patch: Partial<OvertimeOverride>) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500 w-16 shrink-0">Daily h</span>
      <NumberField value={override?.dailyHours ?? 0} min={0} max={24} step={0.5} readOnly={readOnly} ariaLabel="Override daily hours" onCommit={v => onPatch({ dailyHours: v > 0 ? v : undefined })} />
      <span className="text-[10px] text-zinc-500 w-16 shrink-0">OT ×</span>
      <NumberField value={override?.multiplier ?? 0} min={0} max={10} step={0.1} readOnly={readOnly} ariaLabel="Override overtime multiplier" onCommit={v => onPatch({ multiplier: v > 0 ? v : undefined })} />
    </div>
  );
}

/**
 * Overtime (roadmap 334 phase 3) — root-owned by `DayManagerPage`. Reads the
 * ONE engine (`computeDayOvertime`); never computes money itself. Day policy,
 * actual times and department/person overrides are written to
 * `daybreakMeta.overtime`; Post to expenses creates actual/payroll expenses in
 * ONE batch (one undo).
 */
export function OvertimeModal({
  open, day, project, dispatch, readOnly, initialTab = 'day', onClose, onPatchMeta,
}: {
  open: boolean;
  day: DayView;
  project: Project;
  dispatch: React.Dispatch<Action>;
  readOnly: boolean;
  initialTab?: OvertimeTab;
  onClose: () => void;
  onPatchMeta: (patch: Partial<DayMeta>) => void;
}) {
  const dialog = useDialog();
  const [tab, setTab] = React.useState<OvertimeTab>(initialTab);
  React.useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  const input = React.useMemo(() => overtimeDayFromView(project, day), [project, day]);
  const result = React.useMemo(() => computeDayOvertime(project, input), [project, input]);
  const overtime = day.meta.overtime || {};
  const settings = project.budget?.settings;
  const patchOvertime = (patch: Partial<NonNullable<DayMeta['overtime']>>) => {
    onPatchMeta({ overtime: { ...overtime, ...patch } });
  };
  const setOverride = (target: OvertimeOverride['target'], targetId: string, patch: Partial<OvertimeOverride>) => {
    const list = overtime.overrides || [];
    const index = list.findIndex(o => o.target === target && o.targetId === targetId);
    let next: OvertimeOverride[];
    if (index >= 0) {
      const merged = { ...list[index], ...patch };
      const empty = merged.dailyHours == null && merged.multiplier == null && !merged.tiers && !merged.note;
      next = empty ? list.filter((_, i) => i !== index) : list.map((o, i) => i === index ? merged : o);
    } else {
      next = [...list, { target, targetId, ...patch }];
    }
    patchOvertime({ overrides: next });
  };
  const overrideFor = (target: OvertimeOverride['target'], id: string) =>
    (overtime.overrides || []).find(o => o.target === target && o.targetId === id);

  const postExpenses = async () => {
    const expenses = overtimeExpensesForDay(project, input, result) as Partial<Expense>[];
    if (expenses.length === 0) return;
    const ok = await dialog.confirm({
      title: `Post ${expenses.length} overtime expense${expenses.length === 1 ? '' : 's'}?`,
      message: `${formatMoney(result.totalCostCents, settings)} of overtime (${hoursLabel(result.totalOtHours)}) becomes actual payroll spend on ${day.label}. One undo entry.`,
      danger: false,
    });
    if (!ok) return;
    dispatch({ type: 'BATCH_START' });
    try {
      onPatchMeta({ overtime: { ...overtime, postedAt: new Date().toISOString() } });
      dispatch({ type: 'BULK_ADD_EXPENSES', payload: expenses });
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
  };

  const rowRate = (row: OvertimeRow) => (
    row.noRate
      ? <span className="text-[10px] text-amber-600">No rate</span>
      : <span className="tabular-nums text-zinc-300">{row.rateCents != null ? formatMoney(row.rateCents, settings) : '—'}<span className="text-zinc-500">/{row.rateUnit}</span></span>
  );

  const crewRow = (row: OvertimeRow, kind: 'crew' | 'cast') => {
    const override = overrideFor('person', row.id);
    return (
      <div key={row.id} className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 space-y-1.5" data-overtime-row={row.id}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-zinc-200 truncate">{row.name}</p>
            <p className="text-[10px] text-zinc-500 truncate">{row.role}{kind === 'crew' && row.department ? ` · ${row.department}` : ''}</p>
          </div>
          <span className="text-[10px] text-zinc-400 tabular-nums">{hoursLabel(row.hours)} → {hoursLabel(row.otHours)} OT</span>
          {rowRate(row)}
          <span className="text-xs font-semibold text-zinc-100 tabular-nums w-20 text-right">{formatMoney(row.otCostCents, settings)}</span>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <OverrideFields override={override} readOnly={readOnly} onPatch={patch => setOverride('person', row.id, patch)} />
            <span className="text-[10px] text-zinc-500 tabular-nums ml-auto">Day cost {formatMoney(row.dayCostCents, settings)}</span>
          </div>
        )}
      </div>
    );
  };

  const policy = resolveOvertimePolicy(project, input, undefined, undefined, 'crew');
  const tiers = overtime.policy?.tiers ?? policy.tiers;
  const setTiers = (next: OvertimeTier[]) => {
    const current: OvertimePolicy = overtime.policy || {};
    patchOvertime({ policy: { ...current, tiers: next } });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Overtime — ${day.label}`}
      icon={<Clock className="w-3.5 h-3.5" />}
      width="max-w-3xl"
      footer={
        <ModalFooter>
          <Button variant="subtle" onClick={() => void postExpenses()} disabled={readOnly || result.noRate.length > 0 || result.totalCostCents <= 0} title="Create actual payroll expenses for this day's overtime">
            <BadgeDollarSign className="w-3.5 h-3.5" /> Post to expenses
          </Button>
          <ModalFooterButton onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Seg variant="track" theme="dark" value={tab} options={TABS} onChange={v => setTab(v as OvertimeTab)} />
          <div className="ml-auto flex items-center gap-3 text-[11px] text-zinc-400">
            <span><strong className="text-zinc-100 tabular-nums">{hoursLabel(result.totalOtHours)}</strong> OT</span>
            <span><strong className="text-zinc-100 tabular-nums">{formatMoney(result.totalCostCents, settings)}</strong> cost</span>
            {result.workDayNumber >= 6 && (
              <span className={result.workDayNumber >= 7 ? 'text-rose-400' : 'text-amber-400'}>Day {result.workDayNumber} · ×{result.dayMultiplier}</span>
            )}
          </div>
        </div>

        {result.noRate.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-300" data-overtime-no-rate>
            <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>No numeric rate for {result.noRate.join(', ')} — hours are computed, cost is 0. Set a rate in the Crew Manager / cast details.</span>
          </div>
        )}

        {tab === 'day' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Actual call</span>
                <TimeField value={overtime.actualCall || ''} onChange={v => patchOvertime({ actualCall: v || undefined })} readOnly={readOnly} theme="dark" ariaLabel="Actual call" placeholder={day.callTime} onReset={overtime.actualCall ? () => patchOvertime({ actualCall: undefined }) : undefined} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Actual wrap</span>
                <TimeField value={overtime.actualWrap || ''} onChange={v => patchOvertime({ actualWrap: v || undefined })} readOnly={readOnly} theme="dark" ariaLabel="Actual wrap" placeholder={day.wrap || '18:00'} onReset={overtime.actualWrap ? () => patchOvertime({ actualWrap: undefined }) : undefined} />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Paid day (h)</span>
                <NumberField value={overtime.policy?.dailyHours ?? policy.dailyHours} min={1} max={24} step={0.5} readOnly={readOnly} ariaLabel="Paid day hours" onCommit={v => patchOvertime({ policy: { ...(overtime.policy || {}), dailyHours: v } })} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">6th day ×</span>
                <NumberField value={overtime.policy?.sixthDayMultiplier ?? policy.sixthDayMultiplier} min={0} max={4} step={0.1} readOnly={readOnly} ariaLabel="Sixth day multiplier" onCommit={v => patchOvertime({ policy: { ...(overtime.policy || {}), sixthDayMultiplier: v } })} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">7th day ×</span>
                <NumberField value={overtime.policy?.seventhDayMultiplier ?? policy.seventhDayMultiplier} min={0} max={4} step={0.1} readOnly={readOnly} ariaLabel="Seventh day multiplier" onCommit={v => patchOvertime({ policy: { ...(overtime.policy || {}), seventhDayMultiplier: v } })} />
              </label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <SectionTitle>Tiers (hours after → multiplier)</SectionTitle>
                {!readOnly && (
                  <Button theme="dark" variant="subtle" className="ml-auto" onClick={() => setTiers([...tiers, { afterHours: (tiers[tiers.length - 1]?.afterHours ?? 10) + 2, multiplier: 2 }])} title="Add an overtime tier">
                    <Plus className="w-3 h-3" /> Tier
                  </Button>
                )}
              </div>
              {tiers.map((tier, index) => (
                <div key={`tier-${index}`} className="flex items-center gap-2">
                  <NumberField value={tier.afterHours} min={0} max={24} step={0.5} readOnly={readOnly} ariaLabel={`Tier ${index + 1} after hours`} onCommit={v => setTiers(tiers.map((t, i) => i === index ? { ...t, afterHours: v } : t))} />
                  <span className="text-[10px] text-zinc-500">h →</span>
                  <NumberField value={tier.multiplier} min={0} max={4} step={0.1} readOnly={readOnly} ariaLabel={`Tier ${index + 1} multiplier`} onCommit={v => setTiers(tiers.map((t, i) => i === index ? { ...t, multiplier: v } : t))} />
                  <span className="text-[10px] text-zinc-500">×</span>
                  {!readOnly && tiers.length > 1 && (
                    <Button theme="dark" variant="danger-ghost" onClick={() => setTiers(tiers.filter((_, i) => i !== index))} title="Remove tier">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500">
              Scheduled {day.callTime}{day.wrap ? ` – ${day.wrap}` : ''} · resolved {result.callTime || '—'}{result.wrapTime ? ` – ${result.wrapTime}` : ''} · {hoursLabel(result.hours)}. Actual times and overrides are stored on this day only.
            </p>
            {overtime.postedAt && <p className="text-[10px] text-emerald-400">Posted to expenses {new Date(overtime.postedAt).toLocaleString()}.</p>}
          </div>
        )}

        {tab === 'departments' && (
          <div className="space-y-2">
            {result.departments.length === 0 && <p className="text-xs text-zinc-500">No crew departments on this day.</p>}
            {result.departments.map(dept => {
              const override = overrideFor('department', dept.department);
              return (
                <div key={dept.department} className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-xs font-semibold text-zinc-200 flex-1">{dept.department}</span>
                    <span className="text-[10px] text-zinc-400 tabular-nums">{hoursLabel(dept.otHours)} OT</span>
                    <span className="text-xs font-semibold text-zinc-100 tabular-nums w-20 text-right">{formatMoney(dept.otCostCents, settings)}</span>
                  </div>
                  {!readOnly && <OverrideFields override={override} readOnly={readOnly} onPatch={patch => setOverride('department', dept.department, patch)} />}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'crew' && (
          <div className="space-y-2">
            {result.crew.length === 0 && <p className="text-xs text-zinc-500">No crew assigned to this day.</p>}
            {result.crew.map(row => crewRow(row, 'crew'))}
          </div>
        )}

        {tab === 'cast' && (
          <div className="space-y-2">
            {result.cast.length === 0 && <p className="text-xs text-zinc-500">No cast working this day.</p>}
            {result.cast.map(row => crewRow(row, 'cast'))}
          </div>
        )}
      </div>
    </Modal>
  );
}
