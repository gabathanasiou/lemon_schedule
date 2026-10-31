import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { BudgetSettings, Project } from '../../types';
import type { ScheduleBudgetDiff, ScheduleDiffRow, ScheduleDiffState } from '../../lib/budget/diff';
import {
  defaultScheduleDiffSelection, previewScheduleBudgetDiff,
} from '../../lib/budget/diff';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import Checkbox from '../Checkbox';
import { SectionTile } from './SectionTile';
import { formatMoney } from '../../lib/budget/format';

/**
 * Roadmap 348 — the reviewed schedule sync (`docs/BUDGETING-SURFACES.md` §6).
 * Read-only: it renders the pure diff and hands the explicit selection back to
 * the Budget view, which owns the dispatch and the one undo entry.
 */

const STATE_META: Record<ScheduleDiffState, { label: string; className: string }> = {
  add: { label: 'Add', className: 'bg-emerald-500/15 text-emerald-700' },
  update: { label: 'Update', className: 'bg-blue-500/15 text-blue-700' },
  remove: { label: 'Remove', className: 'bg-red-500/15 text-red-700' },
  keep: { label: 'Kept', className: 'bg-[var(--ui-seg-track-bg)] text-[color:var(--ui-text-faint)]' },
  check: { label: 'Check', className: 'bg-amber-500/15 text-amber-700' },
};

const COUNT_LABEL: { state: ScheduleDiffState; label: string }[] = [
  { state: 'add', label: 'to add' },
  { state: 'update', label: 'to update' },
  { state: 'remove', label: 'to remove' },
  { state: 'check', label: 'to check' },
  { state: 'keep', label: 'kept' },
];

function qtyText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function rowQty(row: ScheduleDiffRow): string {
  switch (row.state) {
    case 'add': return `+${qtyText(row.scheduleQty)}`;
    case 'update': return `${qtyText(row.currentQty)} → ${qtyText(row.scheduleQty)}`;
    case 'remove': return `${qtyText(row.currentQty)} → 0`;
    case 'keep': return qtyText(row.currentQty);
    default: return '';
  }
}

function ReviewRow({ row, selected, readOnly, onToggle }: {
  row: ScheduleDiffRow;
  selected: boolean;
  readOnly: boolean;
  onToggle: () => void;
}) {
  const meta = STATE_META[row.state];
  return (
    <div className="flex items-start gap-2 px-5 pl-14 py-1.5 border-t border-[color:var(--ui-border)]/60">
      {row.applicable
        ? (
          <Checkbox
            variant="plain"
            checked={selected}
            onChange={onToggle}
            disabled={readOnly}
            label={<span className="sr-only">{`Apply ${row.label}`}</span>}
          />
        )
        : <span className="w-4 shrink-0" aria-hidden />}
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${meta.className}`}>
        {meta.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-[color:var(--ui-text-strong)]">{row.label}</div>
        {row.message && (
          <div className={`text-[10px] ${row.state === 'check' ? 'text-amber-700' : 'text-[color:var(--ui-text-faint)]'}`}>
            {row.message}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--ui-text-muted)]">{rowQty(row)}</span>
    </div>
  );
}

export function ScheduleReviewModal({
  open, onClose, project, diff, settings, readOnly, onApply,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  diff: ScheduleBudgetDiff;
  settings: BudgetSettings;
  readOnly: boolean;
  onApply: (selectedIds: string[]) => void;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(defaultScheduleDiffSelection(diff)));

  React.useEffect(() => {
    if (open) setSelected(new Set(defaultScheduleDiffSelection(diff)));
  }, [open, diff]);

  const toggle = React.useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = React.useCallback((ids: string[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      const all = ids.every(id => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const selectedIds = React.useMemo(() => [...selected], [selected]);
  const preview = React.useMemo(
    () => previewScheduleBudgetDiff(project, diff, selectedIds),
    [project, diff, selectedIds],
  );
  const delta = preview.deltaCents;
  const canApply = !readOnly && selectedIds.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Updates from the schedule"
      icon={<RefreshCw className="w-4 h-4" />}
      width="max-w-3xl"
      footer={(
        <ModalFooter>
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          {readOnly && (
            <span className="ml-2 text-[11px] text-[color:var(--ui-text-faint)]">
              Read-only — unlock the budget to apply updates.
            </span>
          )}
          <div className="ml-auto" />
          <ModalFooterButton onClick={() => { if (canApply) onApply(selectedIds); }} disabled={!canApply}>
            {selectedIds.length === 0 ? 'Nothing selected' : `Apply ${selectedIds.length} change${selectedIds.length === 1 ? '' : 's'}`}
          </ModalFooterButton>
        </ModalFooter>
      )}
    >
      <div className="px-5 pt-4 pb-3 space-y-3">
        <p className="text-[11px] text-[color:var(--ui-text-muted)]">
          Linked quantities already follow the schedule in the sheet. This review refreshes the stored
          snapshots, adds sources that have no line yet, and flags links that need attention. Rates,
          fringes, globals, the chart and manual lines are never changed.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <SectionTile label="Budget now" value={formatMoney(preview.beforeTotalCents, settings)} />
          <SectionTile label="After review" value={formatMoney(preview.afterTotalCents, settings)} />
          <SectionTile
            label="Change"
            value={delta === 0 ? 'No cost change' : `${delta > 0 ? '+' : ''}${formatMoney(delta, settings)}`}
            tone={delta === 0 ? 'muted' : delta > 0 ? 'bad' : 'good'}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {COUNT_LABEL.map(({ state, label }) => diff.counts[state] > 0 && (
            <span key={state} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATE_META[state].className}`}>
              {diff.counts[state]} {label}
            </span>
          ))}
        </div>
      </div>

      <div className="max-h-[52vh] overflow-y-auto scrollbar-custom border-t border-[color:var(--ui-border)]">
        {diff.categories.map(cat => {
          const catIds = cat.rows.filter(row => row.applicable).map(row => row.id);
          return (
            <div key={cat.id} className="border-b border-[color:var(--ui-border)] last:border-b-0">
              <div className="flex items-center gap-2 px-5 py-2 bg-[var(--ui-panel-bg)]">
                {catIds.length > 0
                  ? (
                    <Checkbox
                      variant="plain"
                      checked={catIds.every(id => selected.has(id))}
                      onChange={() => toggleGroup(catIds)}
                      disabled={readOnly}
                      label={<span className="sr-only">{`Select ${cat.name}`}</span>}
                    />
                  )
                  : <span className="w-4 shrink-0" aria-hidden />}
                <span className="text-xs font-semibold text-[color:var(--ui-text-strong)]">
                  {cat.number ? `${cat.number}  ${cat.name}` : cat.name}
                </span>
                <span className="ml-auto text-[10px] text-[color:var(--ui-text-faint)]">
                  {cat.rows.length} line{cat.rows.length === 1 ? '' : 's'}
                </span>
              </div>
              {cat.accounts.map(acc => {
                const accIds = acc.rows.filter(row => row.applicable).map(row => row.id);
                return (
                  <div key={acc.id || `missing:${acc.number}:${acc.name}`}>
                    <div className="flex items-center gap-2 px-5 pl-9 py-1.5">
                      {accIds.length > 0
                        ? (
                          <Checkbox
                            variant="plain"
                            checked={accIds.every(id => selected.has(id))}
                            onChange={() => toggleGroup(accIds)}
                            disabled={readOnly}
                            label={<span className="sr-only">{`Select ${acc.name}`}</span>}
                          />
                        )
                        : <span className="w-4 shrink-0" aria-hidden />}
                      <span className="text-[11px] font-semibold text-[color:var(--ui-text-muted)]">
                        {acc.number ? `${acc.number}  ${acc.name}` : acc.name}
                      </span>
                    </div>
                    {acc.departments.map(dept => (
                      <div key={dept.department}>
                        <div className="px-5 pl-14 py-1 text-[9px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">
                          {dept.department}
                        </div>
                        {dept.rows.map(row => (
                          <ReviewRow
                            key={row.id}
                            row={row}
                            selected={selected.has(row.id)}
                            readOnly={readOnly}
                            onToggle={() => toggle(row.id)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default ScheduleReviewModal;
