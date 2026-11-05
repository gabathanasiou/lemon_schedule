import React, { useEffect, useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import type { OvertimePolicy, OvertimeTier, Project } from '../../types';
import { resolveOvertimePolicy } from '../../lib/budget/overtime';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import { BudgetInput, NumberField } from '../budget/fields';

/**
 * Item 358 — the PROJECT overtime policy (crew or cast), edited where budgeting
 * happens. Days apply it through the ONE engine; the Day Manager section only
 * supplies actual times. Industry split: policy in the budget, actuals on the
 * day, cost in the Cost Report.
 */
export function OvertimePolicyModal({
  open, kind, project, readOnly, onClose, onSave,
}: {
  open: boolean;
  kind: 'crew' | 'cast';
  project: Project;
  readOnly: boolean;
  onClose: () => void;
  onSave: (policy: OvertimePolicy) => void;
}) {
  const resolved = resolveOvertimePolicy(project, undefined, undefined, undefined, kind);
  const stored = kind === 'crew' ? project.productionInfo?.overtime : project.productionInfo?.castOvertime;
  const [draft, setDraft] = useState<OvertimePolicy>(stored || {});
  useEffect(() => {
    if (open) setDraft((kind === 'crew' ? project.productionInfo?.overtime : project.productionInfo?.castOvertime) || {});
  }, [open, kind, project.productionInfo?.overtime, project.productionInfo?.castOvertime]);

  const tiers = draft.tiers ?? resolved.tiers;
  const setTiers = (next: OvertimeTier[]) => setDraft(current => ({ ...current, tiers: next }));
  const patch = (updates: Partial<OvertimePolicy>) => setDraft(current => ({ ...current, ...updates }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Overtime policy — ${kind === 'crew' ? 'Crew' : 'Cast'}`}
      icon={<Clock className="w-3.5 h-3.5" />}
      width="max-w-lg"
      footer={
        <ModalFooter>
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <ModalFooterButton onClick={() => onSave(draft)} disabled={readOnly}>Save policy</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 space-y-3">
        <p className="text-[11px] text-[color:var(--ui-text-muted)]">
          Applied to every {kind === 'crew' ? 'crew person' : 'cast member'} unless their own rate overrides it.
          Days only record actual call/wrap; the Cost Report shows the resulting overtime.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">Paid day (h)</span>
            <NumberField value={draft.dailyHours ?? resolved.dailyHours} min={1} max={24} step={0.5} readOnly={readOnly} ariaLabel="Paid day hours" onCommit={v => patch({ dailyHours: v })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">6th day ×</span>
            <NumberField value={draft.sixthDayMultiplier ?? resolved.sixthDayMultiplier} min={0} max={4} step={0.1} readOnly={readOnly} ariaLabel="Sixth day multiplier" onCommit={v => patch({ sixthDayMultiplier: v })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">7th day ×</span>
            <NumberField value={draft.seventhDayMultiplier ?? resolved.seventhDayMultiplier} min={0} max={4} step={0.1} readOnly={readOnly} ariaLabel="Seventh day multiplier" onCommit={v => patch({ seventhDayMultiplier: v })} />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)]">Tiers — hours after → multiplier</span>
            {!readOnly && (
              <Button
                variant="subtle"
                className="ml-auto"
                onClick={() => setTiers([...tiers, { afterHours: (tiers[tiers.length - 1]?.afterHours ?? 10) + 2, multiplier: 2 }])}
                title="Add an overtime tier"
              >
                <Plus className="w-3 h-3" /> Tier
              </Button>
            )}
          </div>
          {tiers.map((tier, index) => (
            <div key={`tier-${index}`} className="flex items-center gap-2">
              <NumberField value={tier.afterHours} min={0} max={24} step={0.5} readOnly={readOnly} ariaLabel={`Tier ${index + 1} after hours`} onCommit={v => setTiers(tiers.map((t, i) => i === index ? { ...t, afterHours: v } : t))} />
              <span className="text-[10px] text-[color:var(--ui-text-faint)]">h →</span>
              <NumberField value={tier.multiplier} min={0} max={4} step={0.1} readOnly={readOnly} ariaLabel={`Tier ${index + 1} multiplier`} onCommit={v => setTiers(tiers.map((t, i) => i === index ? { ...t, multiplier: v } : t))} />
              <span className="text-[10px] text-[color:var(--ui-text-faint)]">×</span>
              {!readOnly && tiers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
                  className="p-1 rounded text-[color:var(--ui-text-faint)] hover:text-red-600"
                  title="Remove tier"
                  aria-label={`Remove tier ${index + 1}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)]">Notes</span>
          <BudgetInput value={draft.notes || ''} onCommit={v => patch({ notes: v || undefined })} readOnly={readOnly} />
        </label>
      </div>
    </Modal>
  );
}
