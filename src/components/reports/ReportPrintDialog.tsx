import React, { useEffect, useMemo, useState } from 'react';
import { Printer, ChevronDown, Check } from 'lucide-react';
import { ReportBlock, ReportCollection, ReportDesign, RibbonDesign, BudgetGroupKind } from '../../types';
import { ReportScope, reportItemKey, reportItemLabel, resolveCollectionItems, RibbonPrintOptions, ReportPrintOptions } from '../../lib/reportData';
import type { BudgetFilter } from '../../lib/budget/calc';
import { DD_TOKEN_TRIGGER_CLASS } from '../../lib/dropdown';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { useReportCtx } from '../../lib/useReportCtx';
import { COLLECTION_LABELS, collectRibbonBlocks, collectBudgetBlocks, isBudgetPrintCollection } from '../../lib/reportBlocks';
import { useCellBorders, CellBorders } from '../../lib/persist';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Checklist from '../Checklist';
import { RibbonDummyPreview } from './ReportRibbonView';

// Print-options dialog for custom reports (File → Print → Custom Reports).
// Every top-level REPEAT shows a checklist of its items — all items are
// pre-checked, unchecking any limits that block to the remaining selection
// (scopes are explicit include lists; an omitted item = excluded). TABLES
// always print ALL their items — no controls.
// Every ribbon block in the design (top-level or nested inside a repeat) gets
// its own option panel (design, cell borders, visibility toggles) plus a live
// dummy preview; a page-size override applies to the whole run. Ribbon options
// always START from the block's own properties; only the page-size override
// persists per project.

const TOP_LEVEL_COLLECTIONS: ReportCollection[] = [
  'scenes', 'days', 'cast', 'elements', 'categories', 'crew', 'locations', 'locationTypes',
  // Cost tracking repeats keep their item checklist; budget hierarchy repeats
  // are covered by the one Budget scope card below (roadmap 363).
  'costReport', 'expenses', 'purchaseOrders',
];

/** Top-level REPEAT blocks only — tables always print everything. Budget
 *  hierarchy repeats deliberately return null: their categories/accounts/
 *  groups are the unified Budget scope card. */
function scopeFor(block: ReportBlock): { collection: ReportCollection; category?: string } | null {
  if (block.type !== 'repeat') return null;
  const coll = block.collection || 'scenes';
  if (!TOP_LEVEL_COLLECTIONS.includes(coll as any) || isBudgetPrintCollection(coll as ReportCollection)) return null;
  return { collection: coll as ReportCollection, category: block.category };
}

const CATEGORY_GROUP_LABELS: Record<BudgetGroupKind, string> = {
  atl: 'ATL', btl: 'BTL', post: 'Post', other: 'Other',
};

function itemLabel(collection: ReportCollection, it: any): string {
  return reportItemLabel(collection, it);
}

interface ReportPrintDialogProps {
  design: ReportDesign;
  /** Reports-designer day picker (roadmap 198): for a day-scoped design, the
   *  top-level `days` repeat starts with only this production day checked
   *  (the user can re-check others). */
  initialDaySectionIndex?: number;
  onPrint: (scopes: ReportScope[], printOptions: ReportPrintOptions, budget?: BudgetFilter) => void;
  onClose: () => void;
}

const ReportPrintDialog: React.FC<ReportPrintDialogProps> = ({ design, initialDaySectionIndex, onPrint, onClose }) => {
  const ctx = useReportCtx();
  const [currentCellBorders] = useCellBorders();

  const project = ctx?.project;
  const ribbonBlocks = useMemo(() => collectRibbonBlocks([
    ...(design.blocks || []),
    ...(design.header || []),
    ...(design.footer || []),
  ]), [design]);

  const resolved = useMemo(() => (design.blocks || [])
    .filter(b => scopeFor(b))
    .map(b => {
      const sc = scopeFor(b)!;
      const items = ctx ? (resolveCollectionItems(ctx, sc.collection, sc.category, undefined, undefined, b) as any[]) : [];
      return { block: b, scope: sc, items, keys: items.map((it, i) => sc.collection === 'crew' ? i : reportItemKey(sc.collection, it)) };
    }), [design.blocks, ctx]);

  // ---- budget scope (roadmap 363) -------------------------------------------
  // ONE card for every budget repeat/table in the design. The print context is
  // rebuilt from a filtered `computeBudget` model, so nested repeats and
  // budgetTable blocks print the SAME subset and the same recomputed totals.
  const budgetBlocks = useMemo(() => collectBudgetBlocks([
    ...(design.blocks || []),
    ...(design.header || []),
    ...(design.footer || []),
  ]), [design]);
  const budgetModel = ctx?.budget;
  const budgetCategories = budgetModel?.categories ?? [];
  const budgetAccounts = useMemo(
    () => budgetCategories.flatMap(c => c.accounts.map(a => ({ category: c.category, account: a.account }))),
    [budgetCategories],
  );
  const budgetGroups = project?.budget?.groups ?? [];
  const hasBudgetContent = budgetBlocks.length > 0 && !!budgetModel;

  type BudgetSelection = { cats: string[]; accounts: string[]; groups: string[] };
  const allBudgetSelection = (): BudgetSelection => ({
    cats: budgetCategories.map(c => c.category.id),
    accounts: budgetAccounts.map(a => a.account.id),
    groups: budgetGroups.map(g => g.id),
  });
  const [budgetSel, setBudgetSel] = useState<BudgetSelection>(allBudgetSelection);
  const visibleBudgetAccounts = budgetAccounts.filter(a => budgetSel.cats.includes(a.category.id));
  const allCatsOn = budgetCategories.length > 0 && budgetCategories.every(c => budgetSel.cats.includes(c.category.id));
  const allAccountsOn = visibleBudgetAccounts.length > 0 && visibleBudgetAccounts.every(a => budgetSel.accounts.includes(a.account.id));
  const allGroupsOn = budgetGroups.length === 0 || budgetGroups.every(g => budgetSel.groups.includes(g.id));

  const toggleBudgetCategory = (id: string) => {
    setBudgetSel(prev => {
      const on = prev.cats.includes(id);
      const accountIds = budgetAccounts.filter(a => a.category.id === id).map(a => a.account.id);
      return {
        ...prev,
        cats: on ? prev.cats.filter(x => x !== id) : [...prev.cats, id],
        accounts: on
          ? prev.accounts.filter(x => !accountIds.includes(x))
          : [...new Set([...prev.accounts, ...accountIds])],
      };
    });
  };
  const toggleBudgetCategoryGroup = (group: BudgetGroupKind) => {
    setBudgetSel(prev => {
      const catIds = budgetCategories.filter(c => c.category.group === group).map(c => c.category.id);
      if (catIds.length === 0) return prev;
      const on = catIds.every(id => prev.cats.includes(id));
      const accountIds = budgetAccounts.filter(a => catIds.includes(a.category.id)).map(a => a.account.id);
      return {
        ...prev,
        cats: on ? prev.cats.filter(id => !catIds.includes(id)) : [...new Set([...prev.cats, ...catIds])],
        accounts: on
          ? prev.accounts.filter(id => !accountIds.includes(id))
          : [...new Set([...prev.accounts, ...accountIds])],
      };
    });
  };
  const toggleAllBudgetCategories = () => {
    setBudgetSel(prev => allCatsOn
      ? { ...prev, cats: [], accounts: [] }
      : { ...prev, cats: budgetCategories.map(c => c.category.id), accounts: budgetAccounts.map(a => a.account.id) });
  };
  const toggleBudgetAccount = (id: string) => {
    setBudgetSel(prev => {
      const next = new Set(prev.accounts);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, accounts: [...next] };
    });
  };
  const toggleAllBudgetAccounts = () => {
    setBudgetSel(prev => {
      const ids = visibleBudgetAccounts.map(a => a.account.id);
      const on = ids.length > 0 && ids.every(id => prev.accounts.includes(id));
      return { ...prev, accounts: on ? prev.accounts.filter(id => !ids.includes(id)) : [...new Set([...prev.accounts, ...ids])] };
    });
  };
  const toggleBudgetGroup = (id: string) => {
    setBudgetSel(prev => {
      const next = new Set(prev.groups);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, groups: [...next] };
    });
  };
  const toggleAllBudgetGroups = () => {
    setBudgetSel(prev => allGroupsOn
      ? { ...prev, groups: [] }
      : { ...prev, groups: budgetGroups.map(g => g.id) });
  };

  // per-block explicit include lists — pre-checked with ALL items; unchecking
  // any item limits that repeat to the remaining selection. A day-scoped
  // design's top-level `days` repeat starts with just the designer's picked
  // day when one was handed over (roadmap 198).
  const [include, setInclude] = useState<Record<string, (string | number)[]>>(() => {
    const base: Record<string, (string | number)[]> = {};
    for (const r of resolved) {
      const picked = initialDaySectionIndex != null && r.scope.collection === 'days'
        ? r.keys.filter(k => String(k) === String(initialDaySectionIndex))
        : [];
      base[r.block.id] = picked.length > 0 ? picked : [...r.keys];
    }
    return base;
  });

  const toggleItem = (id: string, key: string | number) => {
    setInclude(prev => {
      const cur = new Set((prev[id] ?? []).map(String));
      if (cur.has(String(key))) cur.delete(String(key)); else cur.add(String(key));
      return { ...prev, [id]: [...cur] };
    });
  };

  // ---- ribbon options (per block) + page size --------------------------------
  // Ribbon options always START from the block's own properties — the dialog
  // never remembers previous ribbon settings. Only the page-size override is
  // persisted per project.

  const defaultsFor = (b: ReportBlock): RibbonPrintOptions => ({
    ribbonId: b.ribbonId || project?.activeRibbonId,
    cellBorders: currentCellBorders,
    showCallTimes: b.ribbonCallTimes === true,
    showDurations: b.ribbonDurations === true,
    showNotes: b.ribbonNotes !== false,
    showBreaks: b.ribbonBreaks === true,
    showDayBreaks: b.ribbonDayBreaks === true || b.ribbonHeaders === true,
  });

  const [ribbonOverrides, setRibbonOverrides] = useState<Record<string, RibbonPrintOptions>>(() => {
    const base: Record<string, RibbonPrintOptions> = {};
    for (const b of ribbonBlocks) base[b.id] = defaultsFor(b);
    return base;
  });

  const pageKey = project ? `lemon_schedule_report_print_page_${project.id}` : '';
  const [page, setPage] = useState<'inherit' | 'portrait' | 'landscape'>(() => {
    if (!pageKey) return 'inherit';
    try {
      const stored = localStorage.getItem(pageKey);
      if (stored === 'portrait' || stored === 'landscape') return stored;
    } catch { /* ignore */ }
    return 'inherit';
  });
  const [pageOpen, setPageOpen] = useState(false);
  const [ribbonMenuOpenId, setRibbonMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!pageKey) return;
    try {
      localStorage.setItem(pageKey, page);
    } catch { /* ignore */ }
  }, [pageKey, page]);

  const patchRibbon = (id: string, patch: Partial<RibbonPrintOptions>) => {
    setRibbonOverrides(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const ribbonChecklist = (b: ReportBlock, o: RibbonPrintOptions) => [
    { id: 'showCallTimes', label: 'Call times (strips & day breaks)', on: o.showCallTimes === true },
    { id: 'showDurations', label: 'Durations (strips & day totals)', on: o.showDurations === true },
    { id: 'showNotes', label: 'Note rows', on: o.showNotes !== false },
    { id: 'showBreaks', label: 'Break rows', on: o.showBreaks === true },
    { id: 'showDayBreaks', label: 'Day breaks (START OF DAY / End of Day)', on: o.showDayBreaks === true },
  ];

  const resetSettings = () => {
    setInclude(prev => {
      const next = { ...prev };
      for (const r of resolved) next[r.block.id] = [...r.keys];
      return next;
    });
    setPage('inherit');
    setBudgetSel(allBudgetSelection());
    setRibbonOverrides(prev => {
      const next = { ...prev };
      for (const b of ribbonBlocks) next[b.id] = defaultsFor(b);
      return next;
    });
    if (pageKey) { try { localStorage.removeItem(pageKey); } catch { /* ignore */ } }
  };

  const doPrint = () => {
    // Only pass lists that actually narrow: all categories/accounts = no
    // restriction; all groups = no group restriction (ungrouped lines stay in).
    const budgetFilter: BudgetFilter | undefined = hasBudgetContent
      ? {
        categories: budgetSel.cats.length === budgetCategories.length ? undefined : budgetSel.cats,
        accounts: budgetSel.accounts.length === budgetAccounts.length ? undefined : budgetSel.accounts,
        groups: budgetGroups.length === 0 || budgetSel.groups.length === budgetGroups.length ? undefined : budgetSel.groups,
      }
      : undefined;
    onPrint(
      resolved.map(r => ({ collection: r.scope.collection, category: r.scope.category, include: include[r.block.id] ?? [] })),
      {
        ribbonOverrides,
        page: page === 'inherit' ? undefined : page,
      },
      budgetFilter,
    );
  };

  const ribbonDesigns = project?.ribbonDesigns || [];

  return (
    <Modal open onClose={onClose} onReset={resetSettings} title={`Print — ${design.name || 'Report'}`} icon={<Printer className="w-4 h-4" />} width="max-w-3xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={doPrint}>
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center border-b border-[color:var(--ui-border)] pb-1.5">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Page Size</span>
            <DropdownMenu
              open={pageOpen}
              onOpenChange={setPageOpen}
              theme="dark"
              align="left"
              width="min-w-[180px]!"
              contentClassName="z-[10001]"
              trigger={
                <button type="button" className={`${DD_TOKEN_TRIGGER_CLASS} text-xs justify-between cursor-pointer`}>
                  <span className="tabular-nums">{page === 'inherit' ? 'From design' : page === 'portrait' ? 'Portrait' : 'Landscape'}</span>
                  <ChevronDown className="w-3 h-3 text-[color:var(--ui-text-faint)]" />
                </button>
              }
            >
              {(['inherit', 'portrait', 'landscape'] as const).map(m => (
                <DropdownItem
                  key={m}
                  onClick={() => { setPageOpen(false); setPage(m); }}
                  className={page === m ? 'bg-[var(--ui-input-bg)] text-[color:var(--ui-text-strong)]' : ''}
                  trailing={page === m ? <Check className="w-3 h-3 shrink-0" /> : undefined}
                >
                  {m === 'inherit' ? 'From design' : m === 'portrait' ? 'Portrait' : 'Landscape'}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </div>
        </div>

        {hasBudgetContent && (
          <div className="space-y-3 border-t border-[color:var(--ui-border)] pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Budget scope</span>
              <span className="text-[10px] text-[color:var(--ui-text-muted)]">
                {allCatsOn && allAccountsOn && allGroupsOn
                  ? 'All budget rows'
                  : `${budgetSel.cats.length}/${budgetCategories.length} categories · ${visibleBudgetAccounts.filter(a => budgetSel.accounts.includes(a.account.id)).length}/${budgetAccounts.length} accounts${budgetGroups.length > 0 ? ` · ${budgetSel.groups.length}/${budgetGroups.length} line groups` : ''}`}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['atl', 'btl', 'post', 'other'] as const)
                .filter(group => budgetCategories.some(c => c.category.group === group))
                .map(group => {
                  const ids = budgetCategories.filter(c => c.category.group === group).map(c => c.category.id);
                  const on = ids.length > 0 && ids.every(id => budgetSel.cats.includes(id));
                  return (
                    <button
                      key={group}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleBudgetCategoryGroup(group)}
                      className={`px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${on
                        ? 'bg-[var(--ui-input-bg)] border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-strong)]'
                        : 'border-[color:var(--ui-border)] text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:border-[color:var(--ui-border-strong)]'}`}
                    >
                      {on ? '✓ ' : ''}{CATEGORY_GROUP_LABELS[group]}
                    </button>
                  );
                })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Categories</div>
                <Checklist
                  theme="dark"
                  items={budgetCategories.map(c => ({ id: c.category.id, label: `${c.category.number} ${c.category.name}`.trim() }))}
                  selected={budgetSel.cats}
                  onToggle={id => toggleBudgetCategory(String(id))}
                  onToggleAll={toggleAllBudgetCategories}
                  allSelected={allCatsOn}
                  toggleAllLabel={allCatsOn ? 'Deselect all' : `Select all (${budgetCategories.length})`}
                  maxHeight={160}
                  emptyHint="No budget categories."
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Accounts</div>
                <Checklist
                  theme="dark"
                  items={visibleBudgetAccounts.map(a => ({
                    id: a.account.id,
                    label: `${a.category.number} · ${a.account.number} ${a.account.name}`.trim(),
                  }))}
                  selected={budgetSel.accounts}
                  onToggle={id => toggleBudgetAccount(String(id))}
                  onToggleAll={toggleAllBudgetAccounts}
                  allSelected={allAccountsOn}
                  toggleAllLabel={allAccountsOn ? 'Deselect all' : `Select all (${visibleBudgetAccounts.length})`}
                  maxHeight={160}
                  emptyHint="No accounts in the selected categories."
                />
              </div>
            </div>

            {budgetGroups.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Line groups</div>
                <Checklist
                  theme="dark"
                  items={budgetGroups.map(g => ({ id: g.id, label: g.name }))}
                  selected={budgetSel.groups}
                  onToggle={id => toggleBudgetGroup(String(id))}
                  onToggleAll={toggleAllBudgetGroups}
                  allSelected={allGroupsOn}
                  toggleAllLabel={allGroupsOn ? 'Deselect all' : `Select all (${budgetGroups.length})`}
                  maxHeight={120}
                />
                <div className="text-[10px] text-[color:var(--ui-text-faint)]">
                  {allGroupsOn
                    ? 'All lines print, grouped and ungrouped.'
                    : 'Only lines in the selected groups print; ungrouped lines are excluded.'}
                </div>
              </div>
            )}

            <div className="text-[10px] text-[color:var(--ui-text-faint)]">
              The design’s own budget filters still apply. Totals follow this print scope.
            </div>
          </div>
        )}

        {resolved.length === 0 && ribbonBlocks.length === 0 && !hasBudgetContent && (
          <div className="text-sm text-[color:var(--ui-text-muted)]">This report has no repeated content — it prints as-is.</div>
        )}

        {resolved.map(({ block, scope, items, keys }) => {
          const selected = include[block.id] ?? [];
          const allChecked = selected.length === keys.length;
          return (
            <div key={block.id} className="space-y-2">
              <span className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">
                Repeat over {COLLECTION_LABELS[scope.collection]}
              </span>
              <Checklist
                items={items.map((it, i) => ({ id: String(keys[i]), label: itemLabel(scope.collection, it) || String(keys[i]) }))}
                selected={selected.map(String)}
                onToggle={key => toggleItem(block.id, key)}
                onToggleAll={() => setInclude(prev => ({ ...prev, [block.id]: allChecked ? [] : [...keys] }))}
                allSelected={allChecked}
                toggleAllLabel={allChecked ? 'Deselect all' : `Select all (${items.length})`}
                maxHeight={224}
              />
            </div>
          );
        })}

        {ribbonBlocks.map(b => {
          const o = ribbonOverrides[b.id] || defaultsFor(b);
          const design = ribbonDesigns.find(d => d.id === o.ribbonId) || ribbonDesigns[0];
          const checks = ribbonChecklist(b, o);
          const leftChecks = checks.slice(0, 2);
          const rightChecks = checks.slice(2);
          return (
            <div key={b.id} className="space-y-3">
              <div className="flex items-center border-b border-[color:var(--ui-border)] pb-1.5">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider">Ribbon Layout</span>
                  <DropdownMenu
                    open={ribbonMenuOpenId === b.id}
                    onOpenChange={(o) => setRibbonMenuOpenId(o ? b.id : null)}
                    theme="dark"
                    align="left"
                    width="min-w-[180px]!"
                    contentClassName="z-[10001]"
                    trigger={
                      <button type="button" className={`${DD_TOKEN_TRIGGER_CLASS} text-xs justify-between cursor-pointer`}>
                        <span className="tabular-nums truncate max-w-[160px]">{design?.name || '—'}</span>
                        <ChevronDown className="w-3 h-3 text-[color:var(--ui-text-faint)]" />
                      </button>
                    }
                  >
                    {ribbonDesigns.map(d => (
                      <DropdownItem
                        key={d.id}
                        onClick={() => { setRibbonMenuOpenId(null); patchRibbon(b.id, { ribbonId: d.id }); }}
                        className={o.ribbonId === d.id ? 'bg-[var(--ui-input-bg)] text-[color:var(--ui-text-strong)]' : ''}
                        trailing={o.ribbonId === d.id ? <Check className="w-3 h-3 shrink-0" /> : undefined}
                      >
                        {d.name}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </div>
              </div>

              <div className="mb-3 border border-[color:var(--ui-card-border)] rounded overflow-hidden">
                {ctx && (
                  <RibbonDummyPreview ctx={ctx} overrides={o} />
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider border-b border-[color:var(--ui-border)] pb-1.5">Cell Borders</h3>
                <div className="flex gap-1.5">
                  {(['none', 'vertical', 'horizontal', 'both'] as CellBorders[]).map(m => (
                    <button
                      key={m}
                      onClick={() => patchRibbon(b.id, { cellBorders: m })}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${(o.cellBorders ?? 'none') === m ? 'bg-[var(--ui-input-bg)] text-[color:var(--ui-text-strong)]' : 'text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-card-bg)]'}`}
                    >
                      {m === 'none' ? 'None' : m === 'vertical' ? 'Vertical' : m === 'horizontal' ? 'Horizontal' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider border-b border-[color:var(--ui-border)] pb-1.5">Ribbon</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  <Checklist
                    items={leftChecks.map(c => ({ id: c.id, label: c.label }))}
                    selected={leftChecks.filter(c => c.on).map(c => c.id)}
                    onToggle={k => patchRibbon(b.id, { [k]: !leftChecks.find(c => c.id === k)!.on } as Partial<RibbonPrintOptions>)}
                  />
                  <Checklist
                    items={rightChecks.map(c => ({ id: c.id, label: c.label }))}
                    selected={rightChecks.filter(c => c.on).map(c => c.id)}
                    onToggle={k => patchRibbon(b.id, { [k]: !rightChecks.find(c => c.id === k)!.on } as Partial<RibbonPrintOptions>)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

export default ReportPrintDialog;
