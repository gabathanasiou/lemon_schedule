import React, { useEffect, useMemo, useState } from 'react';
import { Printer, ChevronDown, Check } from 'lucide-react';
import { ReportBlock, ReportCollection, ReportDesign, RibbonDesign } from '../../types';
import { ReportScope, reportItemKey, reportItemLabel, resolveCollectionItems, RibbonPrintOptions, ReportPrintOptions } from '../../lib/reportData';
import { DD_CHIP_TRIGGER_CLASS } from '../../lib/dropdown';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { useReportCtx } from '../../lib/useReportCtx';
import { COLLECTION_LABELS } from '../../lib/reportBlocks';
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

const TOP_LEVEL_COLLECTIONS: ReportCollection[] = ['scenes', 'days', 'cast', 'elements', 'categories', 'crew', 'locations', 'locationTypes'];

/** Top-level REPEAT blocks only — tables always print everything. */
function scopeFor(block: ReportBlock): { collection: ReportCollection; category?: string } | null {
  if (block.type !== 'repeat') return null;
  const coll = block.collection || 'scenes';
  if (!TOP_LEVEL_COLLECTIONS.includes(coll as any)) return null;
  return { collection: coll as ReportCollection, category: block.category };
}

function itemLabel(collection: ReportCollection, it: any): string {
  return reportItemLabel(collection, it);
}

/** Every ribbon block in the design — top-level AND nested (repeat/columns/
 *  callSheetEdit children, header/footer). Print options apply per block id. */
function collectRibbonBlocks(list: ReportBlock[] | undefined, out: ReportBlock[] = []): ReportBlock[] {
  if (!list) return out;
  for (const b of list) {
    if (b.type === 'ribbon') out.push(b);
    if (b.type === 'repeat' || b.type === 'callSheetEdit' || b.type === 'relative') collectRibbonBlocks(b.children, out);
    if (b.type === 'columns') for (const c of b.cols || []) collectRibbonBlocks(c.blocks, out);
  }
  return out;
}

interface ReportPrintDialogProps {
  design: ReportDesign;
  onPrint: (scopes: ReportScope[], printOptions: ReportPrintOptions) => void;
  onClose: () => void;
}

const ReportPrintDialog: React.FC<ReportPrintDialogProps> = ({ design, onPrint, onClose }) => {
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

  // per-block explicit include lists — pre-checked with ALL items; unchecking
  // any item limits that repeat to the remaining selection
  const [include, setInclude] = useState<Record<string, (string | number)[]>>(() => {
    const base: Record<string, (string | number)[]> = {};
    for (const r of resolved) base[r.block.id] = [...r.keys];
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
    setRibbonOverrides(prev => {
      const next = { ...prev };
      for (const b of ribbonBlocks) next[b.id] = defaultsFor(b);
      return next;
    });
    if (pageKey) { try { localStorage.removeItem(pageKey); } catch { /* ignore */ } }
  };

  const doPrint = () => {
    onPrint(
      resolved.map(r => ({ collection: r.scope.collection, category: r.scope.category, include: include[r.block.id] ?? [] })),
      {
        ribbonOverrides,
        page: page === 'inherit' ? undefined : page,
      },
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
        <div className="flex items-center border-b border-zinc-800 pb-1.5">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Page Size</span>
            <DropdownMenu
              open={pageOpen}
              onOpenChange={setPageOpen}
              theme="dark"
              align="left"
              width="min-w-[180px]!"
              contentClassName="z-[10001]"
              trigger={
                <button type="button" className={`${DD_CHIP_TRIGGER_CLASS} text-xs justify-between cursor-pointer`}>
                  <span className="tabular-nums">{page === 'inherit' ? 'From design' : page === 'portrait' ? 'Portrait' : 'Landscape'}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500" />
                </button>
              }
            >
              {(['inherit', 'portrait', 'landscape'] as const).map(m => (
                <DropdownItem
                  key={m}
                  onClick={() => { setPageOpen(false); setPage(m); }}
                  className={page === m ? 'bg-zinc-800 text-white' : ''}
                  trailing={page === m ? <Check className="w-3 h-3 shrink-0" /> : undefined}
                >
                  {m === 'inherit' ? 'From design' : m === 'portrait' ? 'Portrait' : 'Landscape'}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </div>
        </div>

        {resolved.length === 0 && ribbonBlocks.length === 0 && (
          <div className="text-sm text-zinc-400">This report has no repeated content — it prints as-is.</div>
        )}

        {resolved.map(({ block, scope, items, keys }) => {
          const selected = include[block.id] ?? [];
          const allChecked = selected.length === keys.length;
          return (
            <div key={block.id} className="space-y-2">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
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
              <div className="flex items-center border-b border-zinc-800 pb-1.5">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Ribbon Layout</span>
                  <DropdownMenu
                    open={ribbonMenuOpenId === b.id}
                    onOpenChange={(o) => setRibbonMenuOpenId(o ? b.id : null)}
                    theme="dark"
                    align="left"
                    width="min-w-[180px]!"
                    contentClassName="z-[10001]"
                    trigger={
                      <button type="button" className={`${DD_CHIP_TRIGGER_CLASS} text-xs justify-between cursor-pointer`}>
                        <span className="tabular-nums truncate max-w-[160px]">{design?.name || '—'}</span>
                        <ChevronDown className="w-3 h-3 text-zinc-500" />
                      </button>
                    }
                  >
                    {ribbonDesigns.map(d => (
                      <DropdownItem
                        key={d.id}
                        onClick={() => { setRibbonMenuOpenId(null); patchRibbon(b.id, { ribbonId: d.id }); }}
                        className={o.ribbonId === d.id ? 'bg-zinc-800 text-white' : ''}
                        trailing={o.ribbonId === d.id ? <Check className="w-3 h-3 shrink-0" /> : undefined}
                      >
                        {d.name}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </div>
              </div>

              <div className="mb-3 border border-zinc-700 rounded overflow-hidden">
                {ctx && (
                  <RibbonDummyPreview ctx={ctx} overrides={o} />
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5">Cell Borders</h3>
                <div className="flex gap-1.5">
                  {(['none', 'vertical', 'horizontal', 'both'] as CellBorders[]).map(m => (
                    <button
                      key={m}
                      onClick={() => patchRibbon(b.id, { cellBorders: m })}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${(o.cellBorders ?? 'none') === m ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                    >
                      {m === 'none' ? 'None' : m === 'vertical' ? 'Vertical' : m === 'horizontal' ? 'Horizontal' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 pb-1.5">Ribbon</h3>
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
