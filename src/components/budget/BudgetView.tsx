import React from 'react';
import { Download, FileUp, Plus, Printer, Sparkles } from 'lucide-react';
import type { BudgetFringe, BudgetGroup, BudgetLine, BudgetMarkup, Project, ReportDesign } from '../../types';
import type { BudgetModel } from '../../lib/budget/calc';
import { flatBudgetLines } from '../../lib/budget/calc';
import { makeBudgetAccount, makeBudgetCategory, makeBudgetFringe, makeBudgetGroup, makeBudgetLine, makeBudgetMarkup } from '../../lib/budget/model';
import { formatMoney, formatPercent, parseMoney } from '../../lib/budget/format';
import { budgetFilename, downloadFile, exportBudgetCsv, exportBudgetJson, parseBudgetJson } from '../../lib/budget/export';
import { useProject } from '../../store';
import { useDialog } from '../Dialog';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DropdownDivider from '../DropdownDivider';
import DropdownSubmenu from '../DropdownSubmenu';
import { budgetReportDesigns } from '../../lib/budget/reportTemplates';
import { SectionTile } from './SectionTile';
import { BudgetGrid, type BudgetGridCommit } from './BudgetGrid';
import { BudgetLineModal } from './BudgetLineModal';
import { BudgetNodeModal } from './BudgetNodeModal';

/** Budget authoring surface: KPI strip, category rail and the editable sheet. */
export function BudgetView({ model, project, readOnly, onPrintDesign }: { model: BudgetModel; project: Project; readOnly: boolean; onPrintDesign?: (design: ReportDesign) => void }) {
  const { dispatch } = useProject();
  const dialog = useDialog();
  const [focusCategoryId, setFocusCategoryId] = React.useState<string | null>(null);
  const [editingLineId, setEditingLineId] = React.useState<string | null>(null);
  const [editingNode, setEditingNode] = React.useState<{ kind: 'category' | 'account'; id: string } | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [printOpen, setPrintOpen] = React.useState(false);
  const printDesigns = React.useMemo(() => budgetReportDesigns(), []);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const budget = model.budget;
  const settings = model.settings;

  const linesById = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof flatBudgetLines>[number]>();
    for (const line of flatBudgetLines(model)) map.set(line.line.id, line);
    return map;
  }, [model]);
  const editingLine = editingLineId ? linesById.get(editingLineId)?.line : undefined;
  const editingCategory = editingNode?.kind === 'category' ? budget.categories.find(c => c.id === editingNode.id) : undefined;
  const editingAccount = editingNode?.kind === 'account' ? budget.accounts.find(a => a.id === editingNode.id) : undefined;

  const addCategory = React.useCallback(() => {
    const category = makeBudgetCategory({ name: 'New Category', sort: budget.categories.length });
    dispatch({ type: 'ADD_BUDGET_CATEGORY', payload: category });
    setFocusCategoryId(category.id);
  }, [dispatch, budget.categories.length]);

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

  /** Category "+" — create the line in the category's first account (or a
   *  General account when the category has none) without opening the modal. */
  const quickAddLine = React.useCallback((categoryId: string) => {
    const category = budget.categories.find(c => c.id === categoryId);
    if (!category) return;
    const accounts = budget.accounts
      .filter(a => a.categoryId === categoryId)
      .sort((a, b) => a.sort - b.sort || a.number.localeCompare(b.number));
    dispatch({ type: 'BATCH_START' });
    try {
      let accountId = accounts[0]?.id;
      if (!accountId) {
        const account = makeBudgetAccount({ categoryId, name: 'General' });
        dispatch({ type: 'ADD_BUDGET_ACCOUNT', payload: account });
        accountId = account.id;
      }
      dispatch({
        type: 'ADD_BUDGET_LINE',
        payload: makeBudgetLine({ accountId, description: 'New Line', qty: 1, rateCents: 0, unit: 'unit-flat' }),
      });
    } finally {
      dispatch({ type: 'BATCH_COMMIT' });
    }
  }, [dispatch, budget.categories, budget.accounts]);

  /** Account context "Add line" — same quick add, no modal. */
  const quickAddAccountLine = React.useCallback((accountId: string) => {
    dispatch({
      type: 'ADD_BUDGET_LINE',
      payload: makeBudgetLine({ accountId, description: 'New Line', qty: 1, rateCents: 0, unit: 'unit-flat' }),
    });
  }, [dispatch]);

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
  const linkedLabel = model.linkedLineCount > 0
    ? `${model.linkedLineCount} line${model.linkedLineCount === 1 ? ' follows' : 's follow'} the schedule`
    : 'No lines linked to the schedule';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--ui-modal-header-base)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0">
        <Button theme="light" onClick={addCategory} disabled={readOnly}>
          <Plus className="w-3.5 h-3.5" /> Category
        </Button>
        <Button theme="light" onClick={addMarkup} disabled={readOnly}>
          <Plus className="w-3.5 h-3.5" /> Markup
        </Button>
        <span className="ml-1 flex items-center gap-1 text-[10px] text-[color:var(--ui-text-faint)]">
          <Sparkles className="w-3 h-3" /> {linkedLabel}
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
              {printDesigns.map(design => (
                <DropdownItem
                  key={`print-${design.id}`}
                  onClick={() => { setPrintOpen(false); onPrintDesign(design); }}
                >
                  Print {design.name.replace('Budget — ', '')}
                </DropdownItem>
              ))}
              <DropdownDivider />
              <DropdownSubmenu id="save-budget-design" label="Save as design" width="w-56">
                {printDesigns.map(design => (
                  <DropdownItem
                    key={`save-${design.id}`}
                    onClick={() => {
                      setPrintOpen(false);
                      dispatch({ type: 'ADD_REPORT_DESIGN', payload: { name: design.name, blocks: design.blocks, page: design.page, header: design.header, footer: design.footer } });
                    }}
                  >
                    {design.name.replace('Budget — ', '')}
                  </DropdownItem>
                ))}
              </DropdownSubmenu>
            </DropdownMenu>
          )}
          <DropdownMenu
            open={exportOpen}
            onOpenChange={setExportOpen}
            width="w-44"
            theme="light"
            trigger={<Button theme="light"><Download className="w-3.5 h-3.5" /> Export</Button>}
          >
            <DropdownItem onClick={() => { setExportOpen(false); exportCsv(); }}>Export CSV</DropdownItem>
            <DropdownItem onClick={() => { setExportOpen(false); exportJson(); }}>Export JSON</DropdownItem>
          </DropdownMenu>
          <Button theme="light" onClick={() => fileRef.current?.click()} disabled={readOnly}>
            <FileUp className="w-3.5 h-3.5" /> Import
          </Button>
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
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 px-3 py-2 border-b border-[color:var(--ui-border)] shrink-0">
        <SectionTile label="Grand total" value={formatMoney(totals.grandTotalCents, settings)} />
        <SectionTile label="ATL" value={formatMoney(totals.byGroup.atl, settings)} tone="muted" />
        <SectionTile label="BTL" value={formatMoney(totals.byGroup.btl, settings)} tone="muted" />
        <SectionTile label="Post" value={formatMoney(totals.byGroup.post, settings)} tone="muted" />
        <SectionTile label="Fringes" value={formatMoney(totals.fringeCents, settings)} tone="muted" />
        <SectionTile label="Contingency" value={formatMoney(totals.markupCents, settings)} tone="muted" />
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-52 shrink-0 border-r border-[color:var(--ui-border)] overflow-y-auto scrollbar-custom bg-[var(--ui-panel-bg)]">
          <button
            type="button"
            onClick={() => setFocusCategoryId(null)}
            className={`w-full text-left px-3 py-2 text-xs border-b border-l-2 border-[color:var(--ui-border)] ${focusCategoryId === null ? 'border-l-[color:var(--ui-accent-header-fill)] bg-[var(--ui-item-hover-bg)] font-semibold text-[color:var(--ui-text-strong)]' : 'border-l-transparent text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-item-hover-bg)]'}`}
          >
            All categories
          </button>
          {model.categories.map(cat => (
            <button
              key={cat.category.id}
              type="button"
              onClick={() => setFocusCategoryId(focusCategoryId === cat.category.id ? null : cat.category.id)}
              className={`w-full text-left px-3 py-2 border-b border-l-2 border-[color:var(--ui-border)] ${focusCategoryId === cat.category.id ? 'border-l-[color:var(--ui-accent-header-fill)] bg-[var(--ui-item-hover-bg)] font-semibold text-[color:var(--ui-text-strong)]' : 'border-l-transparent text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-item-hover-bg)]'}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold truncate">{cat.category.number} {cat.category.name}</span>
                <span className="text-[10px] shrink-0">{formatPercent(cat.percentOfGrand, 1)}</span>
              </div>
              <div className="text-[10px] opacity-80">{formatMoney(cat.totalCents, settings)}</div>
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <BudgetGrid
            model={model}
            readOnly={readOnly}
            focusCategoryId={focusCategoryId}
            onCommit={commitEdits}
            onOpenLine={(line) => setEditingLineId(line.id)}
            onOpenNode={(kind, id) => setEditingNode({ kind, id })}
            onAddAccount={addAccount}
            onQuickAddLine={quickAddLine}
            onQuickAddAccountLine={quickAddAccountLine}
            onDuplicateLine={duplicateLine}
            onDeleteCategory={confirmDeleteCategory}
            onDeleteAccount={confirmDeleteAccount}
            onDeleteLine={confirmDeleteLine}
            onDeleteMarkup={confirmDeleteMarkup}
          />
          <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] text-[10px] text-[color:var(--ui-text-muted)] shrink-0">
            <span>Fringes <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(totals.fringeCents, settings)}</strong></span>
            <span>Contingency <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(totals.markupCents, settings)}</strong></span>
            <span className="ml-auto">
              {categoryTotal ? `${categoryTotal.category.name}: ` : 'Grand total: '}
              <strong className="text-[color:var(--ui-text-strong)]">{formatMoney(categoryTotal ? categoryTotal.totalCents : totals.grandTotalCents, settings)}</strong>
            </span>
          </div>
        </div>
      </div>

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
