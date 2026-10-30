import React from 'react';
import { CalendarRange, FileUp, LayoutTemplate, Sparkles, Wallet } from 'lucide-react';
import type { Project } from '../../types';
import Button from '../Button';
import { previewBudgetFromSchedule } from '../../lib/budget/templates/fromSchedule';

/** First-run budget picker (`docs/BUDGETING-SURFACES.md` §2). Blank and
 *  schedule-driven budgets are first-class; Feature gives a full chart. */
export function BudgetEmptyState({
  project, readOnly, onTemplate, onFromSchedule, onImport,
}: {
  project: Project;
  readOnly: boolean;
  onTemplate: (key: 'blank' | 'feature') => void;
  onFromSchedule: () => void;
  onImport: () => void;
}) {
  const preview = React.useMemo(() => previewBudgetFromSchedule(project), [project]);
  const card = 'flex flex-col items-start gap-2 rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-4 text-left transition-colors hover:border-[color:var(--ui-accent-header-fill)] disabled:opacity-50';

  return (
    <div className="flex-1 overflow-y-auto scrollbar-custom bg-[var(--ui-modal-header-base)]">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ui-accent-header-fill)] text-white">
            <Wallet className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[color:var(--ui-text-strong)]">Build a budget</h1>
            <p className="text-xs text-[color:var(--ui-text-muted)]">
              A budget that knows your schedule: linked lines follow the stripboard and calendar automatically.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <button type="button" className={card} disabled={readOnly} onClick={() => onTemplate('blank')}>
            <Wallet className="w-5 h-5 text-[color:var(--ui-text-muted)]" />
            <span className="text-sm font-semibold text-[color:var(--ui-text-strong)]">Blank</span>
            <span className="text-xs text-[color:var(--ui-text-muted)]">Start with an empty chart of accounts and add your own lines.</span>
          </button>
          <button type="button" className={card} disabled={readOnly} onClick={() => onTemplate('feature')}>
            <LayoutTemplate className="w-5 h-5 text-[color:var(--ui-text-muted)]" />
            <span className="text-sm font-semibold text-[color:var(--ui-text-strong)]">Feature</span>
            <span className="text-xs text-[color:var(--ui-text-muted)]">A standard feature-film chart: ATL, BTL, post and 10% contingency.</span>
          </button>
          <button type="button" className={card} disabled={readOnly} onClick={onFromSchedule}>
            <Sparkles className="w-5 h-5 text-[color:var(--ui-text-muted)]" />
            <span className="text-sm font-semibold text-[color:var(--ui-text-strong)]">From schedule</span>
            <span className="text-xs text-[color:var(--ui-text-muted)]">
              {preview.shootDays > 0
                ? `${preview.shootDays} shoot day${preview.shootDays === 1 ? '' : 's'} · ${preview.crewLines} crew · ${preview.castLines} cast · ${preview.locationLines} location${preview.locationLines === 1 ? '' : 's'}`
                : 'No production days scheduled yet — lines will start at zero days.'}
            </span>
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button theme="light" onClick={onImport} disabled={readOnly}>
            <FileUp className="w-3.5 h-3.5" /> Import budget JSON
          </Button>
          <span className="flex items-center gap-1 text-[10px] text-[color:var(--ui-text-faint)]">
            <CalendarRange className="w-3 h-3" /> Linked quantities update live — no sync button.
          </span>
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-[color:var(--ui-text-faint)]">
          Budgets are project state: undoable, synced, and visible to anyone the project is shared with —
          including view-only collaborators.
        </p>
      </div>
    </div>
  );
}
