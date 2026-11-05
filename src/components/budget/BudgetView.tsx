import React from 'react';
import { Seg } from '@gabriel/ui-kit';
import { Plus } from 'lucide-react';
import type { BudgetFringe, BudgetGroup, BudgetLine, BudgetMarkup, Project, ReportDesign } from '../../types';
import type { BudgetModel } from '../../lib/budget/calc';
import { flatBudgetLines } from '../../lib/budget/calc';
import { isoToday, makeBudgetAccount, makeBudgetCategory, makeBudgetFringe, makeBudgetGroup, makeBudgetLine, makeBudgetMarkup } from '../../lib/budget/model';
import { formatMoney, formatPercent, parseMoney } from '../../lib/budget/format';
import { budgetFilename, downloadFile, exportBudgetCsv, exportBudgetJson, parseBudgetJson } from '../../lib/budget/export';
import { computeCostReport } from '../../lib/budget/costReport';
import { periodRange, type PeriodKey } from '../../lib/budget/period';
import { varianceLabel } from '../../lib/budget/gridRows';
import type { GlideViewRestore, GlideViewState } from '../../lib/glideViewState';
import { useProject } from '../../store';
import { useDialog } from '../Dialog';
import { budgetReportDesigns, costReportDesign } from '../../lib/budget/reportTemplates';
import { buildScheduleDiffApply, computeScheduleBudgetDiff } from '../../lib/budget/diff';
import { BudgetGrid, type BudgetGridCommit } from './BudgetGrid';
import { BudgetKpis } from './BudgetKpis';
import { BudgetToolbar } from './BudgetToolbar';
import { CategoryRail, type CategoryRailItem } from './CategoryRail';
import { CostReportGrid } from './CostReportGrid';
import { CostReportToolbar, type CostPeriodState } from './CostReportToolbar';
import { clearBudgetCollapse } from './sheetCollapse';
import { BudgetLineModal } from './BudgetLineModal';
import { BudgetNodeModal } from './BudgetNodeModal';
import { ScheduleReviewModal } from './ScheduleReviewModal';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../ContextMenu';

/** Budget surface (roadmap 334 + 349): one page with a Budget|Cost Report
 *  switch, one rail, one KPI strip and two thin grids over the shared sheet
 *  contract. Authoring lives in Budget mode; the Cost Report only edits
 *  ETC/reason. */
export function BudgetView({
  model, project, readOnly, onPrintDesign, mode, onModeChange,
}: {
  model: BudgetModel;
  project: Project;
  readOnly: boolean;
  onPrintDesign?: (design: ReportDesign) => void;
  mode: 'budget' | 'cost';
  onModeChange: (mode: 'budget' | 'cost') => void;
}) {
  const { dispatch } = useProject();
  const dialog = useDialog();
  const [focusCategoryId, setFocusCategoryId] = React.useState<string | null>(null);
  const [editingLineId, setEditingLineId] = React.useState<string | null>(null);
  const [editingNode, setEditingNode] = React.useState<{ kind: 'category' | 'account'; id: string } | null>(null);
  const [railMenu, setRailMenu] = React.useState<{ x: number; y: number; categoryId?: string } | null>(null);
  const [rowFilter, setRowFilter] = React.useState('');
  const [filterCounts, setFilterCounts] = React.useState({ shown: 0, total: 0 });
  // Rail picks unfold every band; the epoch forces a grid re-render even when
  // the focused category id does not change (e.g. "All categories" again).
  const [railEpoch, setRailEpoch] = React.useState(0);
  const unfoldAll = React.useCallback(() => {
    clearBudgetCollapse();
    setRailEpoch(e => e + 1);
  }, []);
  const updateFilterCounts = React.useCallback((shown: number, total: number) => {
    setFilterCounts(prev => (prev.shown === shown && prev.total === total ? prev : { shown, total }));
  }, []);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [costPeriod, setCostPeriod] = React.useState<CostPeriodState>(() => ({
    asOf: isoToday(), period: 'all' as PeriodKey, customFrom: '', customTo: '',
  }));
  // Shared sheet anchor (roadmap 349): whichever grid is mounted reports its
  // top visible row + selected cell; the incoming grid restores both.
  const sheetViewRef = React.useRef<GlideViewState | null>(null);
  const restoreSeqRef = React.useRef(0);
  const [sheetRestore, setSheetRestore] = React.useState<GlideViewRestore | null>(null);
  const handleViewChange = React.useCallback((state: GlideViewState) => {
    sheetViewRef.current = state;
  }, []);
  const budget = model.budget;
  const printDesigns = React.useMemo(() => budgetReportDesigns(budget), [budget]);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const settings = model.settings;
  const reviewDiff = React.useMemo(
    () => computeScheduleBudgetDiff(project, model.version.id, { model }),
    [project, model],
  );

  // As-of/period stay mounted here so toggling views never resets them. The
  // cost read model is only built while the Cost Report view is showing.
  const costRange = costPeriod.period === 'custom'
    ? { from: costPeriod.customFrom || undefined, to: costPeriod.customTo || undefined }
    : periodRange(costPeriod.period, costPeriod.asOf);
  const costReport = React.useMemo(
    () => mode === 'cost'
      ? computeCostReport(project, { asOf: costPeriod.asOf, from: costRange.from, to: costRange.to, budget: model })
      : null,
    [mode, project, costPeriod.asOf, costRange.from, costRange.to, model],
  );
  const costSettings = costReport?.settings || settings;

  /** Roadmap 348 — apply the reviewed selection as ONE undo entry. Only the
   *  linked quantity snapshots, requested adds and explicitly chosen removals
   *  are written; the diff builder refuses locked/non-active versions. */
  const applyReview = React.useCallback((selectedIds: string[]) => {
    if (readOnly || !reviewDiff) return;
    const apply = buildScheduleDiffApply(project, reviewDiff, selectedIds);
    if (!apply) return;
    if (apply.updates.length === 0 && apply.adds.length === 0 && apply.deletes.length === 0) {
      setReviewOpen(false);
      return;
    }
    dispatch({ type: 'BATCH_START' });
    try {
      if (apply.updates.length > 0) {
        dispatch({ type: 'BULK_UPDATE_BUDGET_LINES', payload: { updates: apply.updates } });
      }
      for (const line of apply.adds) dispatch({ type: 'ADD_BUDGET_LINE', payload: line });
      for (const id of apply.deletes) dispatch({ type: 'DELETE_BUDGET_LINE', payload: id });
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
    setReviewOpen(false);
  }, [dispatch, project, readOnly, reviewDiff]);

  const linesById = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof flatBudgetLines>[number]>();
    for (const line of flatBudgetLines(model)) map.set(line.line.id, line);
    return map;
  }, [model]);
  const editingLine = editingLineId ? linesById.get(editingLineId)?.line : undefined;
  const editingCategory = editingNode?.kind === 'category' ? budget.categories.find(c => c.id === editingNode.id) : undefined;
  const editingAccount = editingNode?.kind === 'account' ? budget.accounts.find(a => a.id === editingNode.id) : undefined;

  /** Item 357 — the (i) modal's rollup: live budget total + cost-report figures. */
  const editingRollup = React.useMemo(() => {
    if (!editingNode) return undefined;
    if (editingNode.kind === 'category') {
      const cat = model.categories.find(c => c.category.id === editingNode.id);
      const cost = costReport?.categories.find(c => c.categoryId === editingNode.id)?.row;
      return cat ? {
        budgetCents: cat.totalCents,
        actualCents: cost?.actualCents,
        committedCents: cost?.committedCents,
        efcCents: cost?.efcCents,
      } : undefined;
    }
    const acc = model.categories.flatMap(c => c.accounts).find(a => a.account.id === editingNode.id);
    const costAcc = costReport?.categories.flatMap(c => c.accounts).find(a => a.accountId === editingNode.id)?.row;
    return acc ? {
      budgetCents: acc.totalCents,
      actualCents: costAcc?.actualCents,
      committedCents: costAcc?.committedCents,
      efcCents: costAcc?.efcCents,
    } : undefined;
  }, [editingNode, model, costReport]);

  const addCategory = React.useCallback(() => {
    const category = makeBudgetCategory({ name: 'New Category', sort: budget.categories.length });
    dispatch({ type: 'ADD_BUDGET_CATEGORY', payload: category });
    unfoldAll();
    setFocusCategoryId(category.id);
  }, [dispatch, budget.categories.length, unfoldAll]);

  const addAccount = React.useCallback((categoryId: string) => {
    const category = budget.categories.find(c => c.id === categoryId);
    if (!category) return;
    dispatch({ type: 'ADD_BUDGET_ACCOUNT', payload: makeBudgetAccount({ categoryId, name: 'New Account' }) });
  }, [dispatch, budget.categories]);

  const addLine = React.useCallback((accountId: string) => {
    const line = makeBudgetLine({ accountId, description: 'New Line', qty: 1, rateCents: 0, unit: 'unit-flat' });
    dispatch({ type: 'ADD_BUDGET_LINE', payload: line });
    setEditingLineId(line.id);
  }, [dispatch]);

  /** Category "+" (and Shift+Enter): create the line in the category's first
   *  account (or a General account when the category has none) without opening
   *  the modal. Returns the new line id so the grid can focus its row. */
  const quickAddLine = React.useCallback((categoryId: string): string | null => {
    const category = budget.categories.find(c => c.id === categoryId);
    if (!category) return null;
    const accounts = budget.accounts
      .filter(a => a.categoryId === categoryId)
      .sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number));
    const line = makeBudgetLine({ accountId: '', description: 'New Line', qty: 1, rateCents: 0, unit: 'unit-flat' });
    dispatch({ type: 'BATCH_START' });
    try {
      let accountId = accounts[0]?.id;
      if (!accountId) {
        const account = makeBudgetAccount({ categoryId, name: 'General' });
        dispatch({ type: 'ADD_BUDGET_ACCOUNT', payload: account });
        accountId = account.id;
      }
      dispatch({ type: 'ADD_BUDGET_LINE', payload: { ...line, accountId } });
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
    return line.id;
  }, [dispatch, budget.categories, budget.accounts]);

  /** Account context "Add line" — same quick add, no modal. */
  const quickAddAccountLine = React.useCallback((accountId: string): string => {
    const line = makeBudgetLine({ accountId, description: 'New Line', qty: 1, rateCents: 0, unit: 'unit-flat' });
    dispatch({ type: 'ADD_BUDGET_LINE', payload: line });
    return line.id;
  }, [dispatch]);

  /** Nothing focused: append to the last category's first account. */
  const quickAddLastLine = React.useCallback((): string | null => {
    const last = budget.categories[budget.categories.length - 1];
    return last ? quickAddLine(last.id) : null;
  }, [budget.categories, quickAddLine]);

  /** Context-menu bulk entry (roadmap 337): ask a count and create N blank
   *  lines in the row's account (a category uses its first account / General)
   *  as ONE undo entry. */
  const promptAddLines = React.useCallback(async (kind: 'category' | 'account', id: string) => {
    const raw = await dialog.prompt({
      title: kind === 'category' ? 'Add lines to this category' : 'Add lines to this account',
      message: 'How many blank lines? (1–100)',
      defaultValue: '1',
      placeholder: '1',
    });
    if (raw == null) return;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) return;
    const count = Math.min(100, n);
    const accounts = kind === 'category'
      ? budget.accounts.filter(a => a.categoryId === id).sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number))
      : budget.accounts.filter(a => a.id === id);
    dispatch({ type: 'BATCH_START' });
    try {
      let accountId = accounts[0]?.id;
      if (!accountId && kind === 'category') {
        const account = makeBudgetAccount({ categoryId: id, name: 'General' });
        dispatch({ type: 'ADD_BUDGET_ACCOUNT', payload: account });
        accountId = account.id;
      }
      if (!accountId) return;
      for (let i = 0; i < count; i++) {
        dispatch({
          type: 'ADD_BUDGET_LINE',
          payload: makeBudgetLine({ accountId, description: 'New Line', qty: 1, rateCents: 0, unit: 'unit-flat' }),
        });
      }
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
  }, [dispatch, dialog, budget.accounts]);

  const duplicateLine = React.useCallback((lineId: string) => {
    const source = linesById.get(lineId)?.line;
    if (!source) return;
    const copy = makeBudgetLine({
      ...source,
      id: undefined,
      description: `${source.description} (copy)`,
      sort: source.sort + 0.5,
    });
    dispatch({ type: 'ADD_BUDGET_LINE', payload: copy });
  }, [dispatch, linesById]);

  const confirmDeleteCategory = React.useCallback(async (id: string) => {
    const category = budget.categories.find(c => c.id === id);
    if (!category) return;
    const accountIds = new Set(budget.accounts.filter(a => a.categoryId === id).map(a => a.id));
    const lineCount = model.version.lines.filter(l => accountIds.has(l.accountId)).length;
    const ok = await dialog.confirm({
      title: `Delete ${category.number} ${category.name}?`,
      message: lineCount > 0
        ? `${accountIds.size} account${accountIds.size === 1 ? '' : 's'} and ${lineCount} line${lineCount === 1 ? '' : 's'} will be deleted. Undo is available.`
        : 'This category has no accounts yet.',
      danger: true,
      suppressKey: 'lemon_schedule_budget_delete_category',
    });
    if (ok) {
      if (focusCategoryId === id) setFocusCategoryId(null);
      dispatch({ type: 'DELETE_BUDGET_CATEGORY', payload: id });
    }
  }, [budget, model, dialog, dispatch, focusCategoryId]);

  const confirmDeleteAccount = React.useCallback(async (id: string) => {
    const account = budget.accounts.find(a => a.id === id);
    if (!account) return;
    const lineCount = model.version.lines.filter(l => l.accountId === id).length;
    const ok = await dialog.confirm({
      title: `Delete ${account.number} ${account.name}?`,
      message: lineCount > 0
        ? `${lineCount} line${lineCount === 1 ? '' : 's'} in this account will be deleted. Undo is available.`
        : 'This account has no lines yet.',
      danger: true,
      suppressKey: 'lemon_schedule_budget_delete_account',
    });
    if (ok) dispatch({ type: 'DELETE_BUDGET_ACCOUNT', payload: { id } });
  }, [budget.accounts, model, dialog, dispatch]);

  const confirmDeleteLine = React.useCallback(async (id: string) => {
    const line = linesById.get(id)?.line;
    if (!line) return;
    const ok = await dialog.confirm({ title: 'Delete line?', suppressKey: 'lemon_schedule_budget_delete_line', message: `“${line.description}” will be removed. Undo is available.`, danger: true });
    if (ok) dispatch({ type: 'DELETE_BUDGET_LINE', payload: id });
  }, [linesById, dialog, dispatch]);

  const confirmDeleteMarkup = React.useCallback(async (id: string) => {
    const markup = (budget.markups || []).find(m => m.id === id);
    if (!markup) return;
    const ok = await dialog.confirm({ title: `Delete ${markup.name}?`, message: 'The markup will be removed from the budget totals.', danger: true, suppressKey: 'lemon_schedule_budget_delete_markup' });
    if (ok) {
      dispatch({
        type: 'SET_BUDGET_LIBRARY',
        payload: { key: 'markups', value: (budget.markups || []).filter(m => m.id !== id) },
      });
    }
  }, [budget.markups, dialog, dispatch]);

  const addMarkup = React.useCallback(() => {
    const markup: BudgetMarkup = makeBudgetMarkup({
      name: 'New Markup',
      kind: 'markup',
      calc: 'percent',
      percent: 10,
      appliesTo: { all: true },
      sort: (budget.markups || []).length,
    });
    dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key: 'markups', value: [...(budget.markups || []), markup] } });
  }, [dispatch, budget.markups]);

  const commitEdits = React.useCallback((commits: BudgetGridCommit[]) => {
    const lineUpdates = new Map<string, Partial<BudgetLine>>();
    const newFringes: BudgetFringe[] = [];
    const newGroups: BudgetGroup[] = [];
    const fringeIdByName = new Map((budget.fringes || []).map(f => [f.name.trim().toLowerCase(), f.id]));
    const groupIdByName = new Map((budget.groups || []).map(g => [g.name.trim().toLowerCase(), g.id]));
    const resolveNamed = <T extends { id: string; name: string }>(
      raw: string,
      existing: Map<string, string>,
      created: T[],
      make: (name: string) => T,
    ): string[] => raw.split(',').map(x => x.trim()).filter(Boolean).map(name => {
      const key = name.toLowerCase();
      const hit = existing.get(key);
      if (hit) return hit;
      const item = make(name);
      existing.set(key, item.id);
      created.push(item);
      return item.id;
    });

    dispatch({ type: 'BATCH_START' });
    try {
      for (const c of commits) {
        if (c.kind === 'line') {
          const current = linesById.get(c.id)?.line;
          if (!current) continue;
          const patch = lineUpdates.get(c.id) || {};
          if (c.colKey === 'item') patch.description = c.value.trim() || current.description;
          else if (c.colKey === 'qty') {
            const n = Number(c.value.replace(/[^0-9.\-]/g, ''));
            const qty = Number.isFinite(n) ? Math.max(0, n) : current.qty;
            if (current.source && current.qtyOverride == null) patch.qtyOverride = qty;
            else patch.qty = qty;
          } else if (c.colKey === 'rate') {
            patch.rateCents = parseMoney(c.value);
          } else if (c.colKey === 'x') {
            const n = Number(c.value.replace(/[^0-9.\-]/g, ''));
            if (Number.isFinite(n)) patch.multiplier = n;
          } else if (c.colKey === 'unit') {
            const unit = (budget.units || []).find(u => u.name.trim().toLowerCase() === c.value.trim().toLowerCase());
            if (unit) patch.unit = unit.id;
          } else if (c.colKey === 'cur') {
            const code = (budget.currencies || []).find(x => x.code.toUpperCase() === c.value.trim().toUpperCase())?.code;
            if (code) patch.currency = code;
          } else if (c.colKey === 'fringes') {
            patch.fringes = resolveNamed(c.value, fringeIdByName, newFringes, (name) => makeBudgetFringe({ name }));
          } else if (c.colKey === 'groups') {
            patch.groups = resolveNamed(c.value, groupIdByName, newGroups, (name) => makeBudgetGroup({ name }));
          }
          lineUpdates.set(c.id, patch);
        } else if (c.kind === 'category' && c.colKey === 'item') {
          const parsed = parseRowTitle(c.value);
          if (parsed) dispatch({ type: 'UPDATE_BUDGET_CATEGORY', payload: { id: c.id, updates: parsed } });
        } else if (c.kind === 'account' && c.colKey === 'item') {
          const parsed = parseRowTitle(c.value);
          if (parsed) dispatch({ type: 'UPDATE_BUDGET_ACCOUNT', payload: { id: c.id, updates: parsed } });
        }
      }
      // Typed-but-unknown fringe/group names create their library entries in
      // the SAME batch (the EntityDropdown "add new" contract).
      if (newFringes.length > 0) {
        dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key: 'fringes', value: [...(budget.fringes || []), ...newFringes] } });
      }
      if (newGroups.length > 0) {
        dispatch({ type: 'SET_BUDGET_LIBRARY', payload: { key: 'groups', value: [...(budget.groups || []), ...newGroups] } });
      }
      if (lineUpdates.size > 0) {
        dispatch({
          type: 'BULK_UPDATE_BUDGET_LINES',
          payload: { updates: [...lineUpdates.entries()].map(([id, updates]) => ({ id, updates })) },
        });
      }
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
  }, [dispatch, linesById, budget.fringes, budget.groups, budget.units, budget.currencies]);

  const updateLine = React.useCallback((id: string, updates: Partial<BudgetLine>) => {
    dispatch({ type: 'UPDATE_BUDGET_LINE', payload: { id, updates } });
  }, [dispatch]);

  /** Cost Report inline edits: one bulk action, one undo entry. */
  const updateCostLines = React.useCallback((updates: { id: string; updates: Partial<BudgetLine> }[]) => {
    if (updates.length === 0) return;
    dispatch({ type: 'BULK_UPDATE_BUDGET_LINES', payload: { updates } });
  }, [dispatch]);

  const saveCostDesign = React.useCallback(() => {
    const design = costReportDesign();
    dispatch({
      type: 'ADD_REPORT_DESIGN',
      payload: { name: design.name, blocks: design.blocks, page: design.page, header: design.header, footer: design.footer },
    });
  }, [dispatch]);

  const switchMode = React.useCallback((next: 'budget' | 'cost') => {
    setRailMenu(null);
    if (next === 'budget' && focusCategoryId && !model.categories.some(c => c.category.id === focusCategoryId)) {
      setFocusCategoryId(null);
    }
    const source = sheetViewRef.current;
    if (source) setSheetRestore({ ...source, token: ++restoreSeqRef.current });
    onModeChange(next);
  }, [focusCategoryId, model.categories, onModeChange]);

  const exportCsv = () => downloadFile(exportBudgetCsv(project), budgetFilename(project, 'csv'), 'text/csv');
  const exportJson = () => downloadFile(exportBudgetJson(project), budgetFilename(project, 'json'), 'application/json');

  const importJson = async (file: File) => {
    const text = await file.text();
    const parsed = parseBudgetJson(text);
    if (!parsed) {
      await dialog.alert({ title: 'Could not read this budget', message: 'The file is not a Lemon budget export (JSON).' });
      return;
    }
    const ok = await dialog.confirm({
      title: 'Replace the current budget?',
      message: 'The imported budget replaces the chart, library and all versions. Undo is available.',
      danger: true,
      suppressKey: 'lemon_schedule_budget_import_replace',
    });
    if (ok) dispatch({ type: 'IMPORT_BUDGET', payload: { budget: parsed } });
  };

  const totals = model.totals;
  const categoryTotal = focusCategoryId ? model.categories.find(c => c.category.id === focusCategoryId) : undefined;
  const costCategoryTotal = mode === 'cost' && focusCategoryId
    ? costReport?.categories.find(c => c.categoryId === focusCategoryId)
    : undefined;
  const railItems: CategoryRailItem[] = mode === 'cost' && costReport
    ? costReport.categories.map(cat => ({
        id: cat.categoryId,
        number: cat.number,
        name: cat.name,
        meta: formatPercent(cat.row.percentUsed, 1),
        amountCents: cat.row.efcCents,
        detail: cat.row.varianceCents === 0 ? undefined : varianceLabel(cat.row.varianceCents, costSettings),
        detailTone: cat.row.varianceCents > 0 ? 'good' : cat.row.varianceCents < 0 ? 'bad' : undefined,
        notInBudget: !cat.inBudget,
      }))
    : model.categories.map(cat => ({
        id: cat.category.id,
        number: cat.category.number,
        name: cat.category.name,
        meta: formatPercent(cat.percentOfGrand, 1),
        amountCents: cat.totalCents,
      }));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--ui-modal-header-base)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0 flex-wrap">
        <Seg
          variant="track"
          dense
          value={mode}
          options={[
            { v: 'budget', l: 'Budget', dataProps: { 'data-presence-anchor': 'toolbar:budget:view:budget' } },
            { v: 'cost', l: 'Cost Report', dataProps: { 'data-presence-anchor': 'toolbar:budget:view:cost' } },
          ]}
          onChange={v => switchMode(v as 'budget' | 'cost')}
          ariaLabel="Budget view"
        />
        {mode === 'budget' ? (
          <BudgetToolbar
            readOnly={readOnly}
            reviewDiff={reviewDiff}
            rowFilter={rowFilter}
            onRowFilterChange={setRowFilter}
            filterCounts={filterCounts}
            onAddMarkup={addMarkup}
            onOpenReview={() => setReviewOpen(true)}
            printDesigns={printDesigns}
            onPrintDesign={onPrintDesign}
            onSaveDesign={(design) => dispatch({ type: 'ADD_REPORT_DESIGN', payload: { name: design.name, blocks: design.blocks, page: design.page, header: design.header, footer: design.footer } })}
            onExportCsv={exportCsv}
            onExportJson={exportJson}
            onImport={() => fileRef.current?.click()}
          />
        ) : (
          <CostReportToolbar
            report={costReport}
            project={project}
            state={costPeriod}
            onChange={patch => setCostPeriod(prev => ({ ...prev, ...patch }))}
            onPrintDesign={onPrintDesign}
            onSaveDesign={saveCostDesign}
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importJson(file);
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
      </div>

      <BudgetKpis mode={mode} model={model} report={costReport} />

      <div className="flex-1 flex min-h-0">
        <CategoryRail
          items={railItems}
          settings={mode === 'cost' ? costSettings : settings}
          focusCategoryId={focusCategoryId}
          onFocus={(id) => { unfoldAll(); setFocusCategoryId(id); }}
          mode={mode}
          readOnly={readOnly}
          onAddCategory={mode === 'budget' ? addCategory : undefined}
          onMenu={mode === 'budget' ? (e, categoryId) => setRailMenu({ x: e.clientX, y: e.clientY, categoryId }) : undefined}
        />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {mode === 'cost' ? (
            costReport ? (
              <CostReportGrid
                report={costReport}
                readOnly={readOnly}
                focusCategoryId={focusCategoryId}
                filter={rowFilter}
                viewEpoch={railEpoch}
                onFilterCounts={updateFilterCounts}
                onLineUpdates={updateCostLines}
                viewRestore={sheetRestore}
                onViewChange={handleViewChange}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-10 text-center text-xs text-[color:var(--ui-text-muted)]">
                No cost report — the active budget version is unavailable.
              </div>
            )
          ) : (
            <BudgetGrid
              model={model}
              readOnly={readOnly}
              focusCategoryId={focusCategoryId}
              filter={rowFilter}
              viewEpoch={railEpoch}
              onFilterCounts={updateFilterCounts}
              onCommit={commitEdits}
              onOpenLine={(line) => setEditingLineId(line.id)}
              onOpenNode={(kind, id) => setEditingNode({ kind, id })}
              onAddAccount={addAccount}
              onQuickAddLine={quickAddLine}
              onQuickAddAccountLine={quickAddAccountLine}
              onQuickAddLastLine={quickAddLastLine}
              onBulkAddLines={promptAddLines}
              onDuplicateLine={duplicateLine}
              onDeleteCategory={confirmDeleteCategory}
              onDeleteAccount={confirmDeleteAccount}
              onDeleteLine={confirmDeleteLine}
              onDeleteMarkup={confirmDeleteMarkup}
              viewRestore={sheetRestore}
              onViewChange={handleViewChange}
            />
          )}
          {mode === 'cost' ? (
            <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] text-[10px] text-[color:var(--ui-text-muted)] shrink-0">
              <span>Actual <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(costReport?.totals.actualCents || 0, costSettings)}</strong></span>
              <span>Committed <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(costReport?.totals.committedCents || 0, costSettings)}</strong></span>
              {rowFilter.trim() && (
                <span data-budget-filtered className="rounded-full bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--ui-text-muted)]">Filtered</span>
              )}
              <span className="ml-auto">
                {costCategoryTotal ? `${costCategoryTotal.name}: ` : 'Grand total: '}
                <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(costCategoryTotal ? costCategoryTotal.row.efcCents : costReport?.totals.efcCents || 0, costSettings)}</strong>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] text-[10px] text-[color:var(--ui-text-muted)] shrink-0">
              <span>Fringes <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(totals.fringeCents, settings)}</strong></span>
              <span>Contingency <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(totals.markupCents, settings)}</strong></span>
              {rowFilter.trim() && (
                <span data-budget-filtered className="rounded-full bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--ui-text-muted)]">Filtered</span>
              )}
              <span className="ml-auto">
                {categoryTotal ? `${categoryTotal.category.name}: ` : 'Grand total: '}
                <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(categoryTotal ? categoryTotal.totalCents : totals.grandTotalCents, settings)}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      <ContextMenu open={!!railMenu} x={railMenu?.x ?? 0} y={railMenu?.y ?? 0} onClose={() => setRailMenu(null)}>
        {railMenu?.categoryId && (
          <>
            <ContextMenuItem onClick={() => { const id = railMenu.categoryId!; setRailMenu(null); setEditingNode({ kind: 'category', id }); }}>Edit category</ContextMenuItem>
            <ContextMenuItem onClick={() => { const id = railMenu.categoryId!; setRailMenu(null); addAccount(id); }}>Add account</ContextMenuItem>
            <ContextMenuItem onClick={() => { const id = railMenu.categoryId!; setRailMenu(null); void confirmDeleteCategory(id); }}>Delete category</ContextMenuItem>
            <ContextMenuDivider />
          </>
        )}
        <ContextMenuItem icon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setRailMenu(null); addCategory(); }}>New category</ContextMenuItem>
      </ContextMenu>

      {editingNode && (editingCategory || editingAccount) && (
        <BudgetNodeModal
          open
          kind={editingNode.kind}
          category={editingCategory}
          account={editingAccount}
          readOnly={readOnly}
          onClose={() => setEditingNode(null)}
          onUpdateCategory={(updates) => { if (editingCategory) dispatch({ type: 'UPDATE_BUDGET_CATEGORY', payload: { id: editingCategory.id, updates } }); }}
          onUpdateAccount={(updates) => { if (editingAccount) dispatch({ type: 'UPDATE_BUDGET_ACCOUNT', payload: { id: editingAccount.id, updates } }); }}
          onDelete={() => {
            if (editingCategory) void confirmDeleteCategory(editingCategory.id);
            if (editingAccount) void confirmDeleteAccount(editingAccount.id);
            setEditingNode(null);
          }}
          onAdd={() => {
            if (editingNode.kind === 'category' && editingCategory) addAccount(editingCategory.id);
            if (editingNode.kind === 'account' && editingAccount) addLine(editingAccount.id);
            setEditingNode(null);
          }}
          rollup={editingRollup}
          settings={mode === 'cost' ? costSettings : settings}
        />
      )}

      {editingLine && (
        <BudgetLineModal
          open
          onClose={() => setEditingLineId(null)}
          line={editingLine}
          model={model}
          project={project}
          readOnly={readOnly}
          onUpdate={(updates) => updateLine(editingLine.id, updates)}
          onDelete={() => { void confirmDeleteLine(editingLine.id); setEditingLineId(null); }}
          onDuplicate={() => { duplicateLine(editingLine.id); setEditingLineId(null); }}
          onLink={(source) => dispatch({ type: 'LINK_BUDGET_LINE', payload: { lineId: editingLine.id, source } })}
          onUnlink={() => dispatch({ type: 'UNLINK_BUDGET_LINE', payload: { lineId: editingLine.id, keepQty: linesById.get(editingLine.id)?.qty } })}
          onPin={(qty) => dispatch({ type: 'PIN_BUDGET_LINE', payload: { lineId: editingLine.id, qty } })}
          onUnpin={() => dispatch({ type: 'UNPIN_BUDGET_LINE', payload: editingLine.id })}
        />
      )}

      {reviewOpen && reviewDiff && (
        <ScheduleReviewModal
          open
          onClose={() => setReviewOpen(false)}
          project={project}
          diff={reviewDiff}
          settings={settings}
          readOnly={readOnly}
          onApply={applyReview}
        />
      )}
    </div>
  );
}

/** "1200  Producers" → { number, name }; a bare name keeps the number. */
function parseRowTitle(value: string): { number?: string; name: string } | null {
  const text = value.trim();
  if (!text) return null;
  const match = /^(\d+)\s+(.*)$/.exec(text);
  if (match) {
    const name = match[2].trim();
    return name ? { number: match[1], name } : null;
  }
  return { name: text };
}
