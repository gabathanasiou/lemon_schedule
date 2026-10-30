import React from 'react';
import { ChartNoAxesCombined, Library, Receipt, Wallet } from 'lucide-react';
import { ThemeScope } from '@gabriel/ui-kit';
import type { ReportDesign } from '../../types';
import { useProject } from '../../store';
import { computeBudget } from '../../lib/budget/calc';
import {
  activeBudgetVersion, makeBlankBudget,
} from '../../lib/budget/model';
import { buildBudgetFromSchedule } from '../../lib/budget/templates/fromSchedule';
import { lockBudgetVersion } from '../../lib/budget/scheduleSync';
import { parseBudgetJson } from '../../lib/budget/export';
import { useDialog } from '../Dialog';
import PageToolbar from '../PageToolbar';
import { BudgetVersionMenu } from './BudgetVersionMenu';
import { BudgetEmptyState } from './BudgetEmptyState';
import { BudgetView } from './BudgetView';
import { BudgetLibraryView } from './BudgetLibraryView';

export type BudgetSubTab = 'budget' | 'cost' | 'expenses' | 'library';

const SUB_TABS = [
  { id: 'budget' as const, label: 'Budget', icon: <Wallet className="w-3.5 h-3.5" /> },
  { id: 'cost' as const, label: 'Cost Report', icon: <ChartNoAxesCombined className="w-3.5 h-3.5" /> },
  { id: 'expenses' as const, label: 'Expenses', icon: <Receipt className="w-3.5 h-3.5" /> },
  { id: 'library' as const, label: 'Library', icon: <Library className="w-3.5 h-3.5" /> },
];

function NextPhase({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-10 bg-[var(--ui-modal-header-base)]">
      <div className="max-w-md text-center">
        <h2 className="text-sm font-semibold text-[color:var(--ui-text-strong)]">{title}</h2>
        <p className="text-xs text-[color:var(--ui-text-muted)] mt-2">{body}</p>
      </div>
    </div>
  );
}

/**
 * Budget tab root (roadmap 334 phase 1): one project read, sub-tab routing,
 * version menu and the empty state. The authoring grid/library are pure
 * props-in surfaces — they never call `useProject()` per row.
 */
export default function BudgetTab({
  subTab, onSubTabChange, onPrintDesign,
}: {
  subTab: BudgetSubTab;
  onSubTabChange: (tab: BudgetSubTab) => void;
  onPrintDesign?: (design: ReportDesign) => void;
}) {
  const { state, dispatch, readOnly, canEdit } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const model = React.useMemo(() => computeBudget(project), [project]);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const canWrite = !readOnly && canEdit;
  const version = project.budget ? activeBudgetVersion(project.budget) : undefined;
  const versionLocked = !!version?.locked;
  const locked = !canWrite || versionLocked;

  const importBudgetFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseBudgetJson(text);
    if (!parsed) {
      await dialog.alert({ title: 'Could not read this budget', message: 'The file is not a Lemon budget export (JSON).' });
      return;
    }
    if (project.budget) {
      const ok = await dialog.confirm({
        title: 'Replace the current budget?',
        message: 'The imported budget replaces the chart, library and all versions. Undo is available.',
        danger: true,
      });
      if (!ok) return;
    }
    dispatch({ type: 'IMPORT_BUDGET', payload: { budget: parsed } });
    onSubTabChange('budget');
  };

  const lockVersion = async () => {
    if (!project.budget || !version) return;
    const ok = await dialog.confirm({
      title: `Lock ${version.name}?`,
      message: 'Locking freezes editing and pins every line that follows the schedule, so an approved budget cannot drift. Unlocking will not remove those pins.',
    });
    if (!ok) return;
    dispatch({ type: 'LOCK_BUDGET_VERSION', payload: lockBudgetVersion(project, version.id) });
  };

  const unlockVersion = async () => {
    if (!version) return;
    const ok = await dialog.confirm({
      title: `Unlock ${version.name}?`,
      message: 'Editing is re-enabled. Lines pinned when the version was locked stay pinned.',
    });
    if (!ok) return;
    dispatch({ type: 'UNLOCK_BUDGET_VERSION', payload: version.id });
  };

  const versionMenu = project.budget && version ? (
    <BudgetVersionMenu
      budget={project.budget}
      activeVersion={version}
      locked={versionLocked}
      canEdit={canWrite}
      onSelect={(id) => dispatch({ type: 'SET_ACTIVE_BUDGET_VERSION', payload: id })}
      onCreate={() => dispatch({ type: 'NEW_BUDGET_VERSION', payload: { name: `v${String((project.budget?.versions.length || 0) + 1).padStart(2, '0')}`, cloneFromId: null } })}
      onRename={(id, name) => dispatch({ type: 'RENAME_BUDGET_VERSION', payload: { id, name } })}
      onDuplicate={(id) => {
        const source = project.budget?.versions.find(v => v.id === id);
        dispatch({ type: 'NEW_BUDGET_VERSION', payload: { name: `${source?.name || 'Version'} Copy`, cloneFromId: id } });
      }}
      onDelete={async (id) => {
        if (!project.budget || project.budget.versions.length <= 1) return;
        const ok = await dialog.confirm({ title: 'Delete this budget version?', message: 'It moves to the budget version trash and can be restored.', danger: true, suppressKey: 'lemon_schedule_budget_delete_version' });
        if (ok) dispatch({ type: 'DELETE_BUDGET_VERSION', payload: id });
      }}
      onRestore={(id) => dispatch({ type: 'RESTORE_BUDGET_VERSION_FROM_TRASH', payload: id })}
      onLock={() => { void lockVersion(); }}
      onUnlock={() => { void unlockVersion(); }}
    />
  ) : null;

  return (
    <ThemeScope mode="light" surface="neutral" className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--ui-panel-bg)] text-[color:var(--ui-text-strong)]">
      <PageToolbar
        tabs={SUB_TABS}
        activeTab={subTab}
        onChange={(id) => onSubTabChange(id as BudgetSubTab)}
        rightContent={versionMenu}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importBudgetFile(file);
          if (fileRef.current) fileRef.current.value = '';
        }}
      />

      {!model || !project.budget || !version ? (
        <BudgetEmptyState
          project={project}
          readOnly={!canWrite}
          onTemplate={(key) => dispatch({ type: 'APPLY_BUDGET_TEMPLATE', payload: { key } })}
          onFromSchedule={() => dispatch({ type: 'IMPORT_BUDGET', payload: { budget: buildBudgetFromSchedule(project) } })}
          onImport={() => fileRef.current?.click()}
        />
      ) : subTab === 'library' ? (
        <BudgetLibraryView model={model} project={project} readOnly={locked} />
      ) : subTab === 'cost' ? (
        <NextPhase
          title="Cost Report — next phase"
          body="Expenses, POs and actuals/committed/ETC/EFC arrive with cost tracking. The budget you author here becomes its baseline."
        />
      ) : subTab === 'expenses' ? (
        <NextPhase
          title="Expenses — next phase"
          body="Day Manager expenses, petty cash and POs arrive with cost tracking. Until then, the Budget tab is estimate-only."
        />
      ) : (
        <BudgetView model={model} project={project} readOnly={locked} onPrintDesign={onPrintDesign} />
      )}
    </ThemeScope>
  );
}
