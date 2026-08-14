import React, { useMemo, useState } from 'react';
import { ReportBlock, ReportCollection, ReportDesign } from '../../types';
import { ReportScope, reportItemKey, resolveCollectionItems } from '../../lib/reportData';
import { useReportCtx } from '../../lib/useReportCtx';
import { COLLECTION_LABELS } from '../../lib/reportBlocks';
import { formatDateShort } from '../../lib/utils';
import Modal, { ModalFooter } from '../Modal';
import Checkbox from '../Checkbox';

// Print-options dialog for custom reports (File → Print → Custom Reports).
// For every top-level repeat/table it lets you include ALL of its items or a
// SELECTED subset — days, scenes, elements, categories, crew — whatever the
// block iterates. Scopes are explicit include lists: an omitted scope = all.

const TOP_LEVEL_COLLECTIONS: ReportCollection[] = ['scenes', 'days', 'cast', 'elements', 'categories', 'crew'];

function scopeFor(block: ReportBlock): { collection: ReportCollection; category?: string } | null {
  if (block.type !== 'repeat' && block.type !== 'table') return null;
  const coll = block.collection || 'scenes';
  if (!TOP_LEVEL_COLLECTIONS.includes(coll as any)) return null;
  return { collection: coll as ReportCollection, category: block.category };
}

function itemLabel(collection: ReportCollection, it: any): string {
  switch (collection) {
    case 'scenes': return `${it.scene.sceneNumber} · ${it.scene.set || it.scene.description || it.scene.intExt || ''}`.replace(/ · $/, '');
    case 'days': return `Day ${it.chronoDay} (${formatDateShort(it.date)})`;
    case 'cast': case 'elements': return it.name;
    case 'categories': return it.label;
    case 'crew': return `${it.role}: ${it.name}`;
    default: return '';
  }
}

interface ReportPrintDialogProps {
  design: ReportDesign;
  onPrint: (scopes: ReportScope[]) => void;
  onClose: () => void;
}

const ReportPrintDialog: React.FC<ReportPrintDialogProps> = ({ design, onPrint, onClose }) => {
  const ctx = useReportCtx();
  const resolved = useMemo(() => (design.blocks || [])
    .filter(b => scopeFor(b))
    .map(b => {
      const sc = scopeFor(b)!;
      const items = ctx ? (resolveCollectionItems(ctx, sc.collection, sc.category, undefined, undefined, b) as any[]) : [];
      return { block: b, scope: sc, items, keys: items.map((it, i) => sc.collection === 'crew' ? i : reportItemKey(sc.collection, it)) };
    }), [design.blocks, ctx]);

  // per-block explicit include lists (Selected mode only)
  const [include, setInclude] = useState<Record<string, (string | number)[]>>({});
  const [mode, setMode] = useState<Record<string, 'all' | 'selected'>>({});

  const setModeFor = (id: string, m: 'all' | 'selected') => {
    setMode(prev => ({ ...prev, [id]: m }));
    if (m === 'selected' && include[id] === undefined) {
      const r = resolved.find(x => x.block.id === id);
      if (r) setInclude(prev => ({ ...prev, [id]: [...r.keys] }));
    } else if (m === 'all') {
      setInclude(prev => ({ ...prev, [id]: [] }));
    }
  };

  const toggleItem = (id: string, key: string | number) => {
    setInclude(prev => {
      const cur = new Set((prev[id] ?? []).map(String));
      if (cur.has(String(key))) cur.delete(String(key)); else cur.add(String(key));
      return { ...prev, [id]: [...cur] };
    });
  };

  const doPrint = () => {
    onPrint(resolved
      .filter(r => (mode[r.block.id] ?? 'all') === 'selected')
      .map(r => ({ collection: r.scope.collection, category: r.scope.category, include: include[r.block.id] ?? [] })));
  };

  return (
    <Modal open onClose={onClose} title={`Print — ${design.name || 'Report'}`} width="w-[520px]">
      <div className="p-6 space-y-5">
        {resolved.length === 0 && (
          <div className="text-sm text-zinc-400">This report has no repeated content — it prints as-is.</div>
        )}
        {resolved.map(({ block, scope, items, keys }) => {
          const blockMode = mode[block.id] ?? 'all';
          const selected = include[block.id];
          const allChecked = selected !== undefined && selected.length === keys.length;
          return (
            <div key={block.id}>
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-zinc-300">
                  {block.type === 'repeat' ? 'Repeat over' : 'Table over'} {COLLECTION_LABELS[scope.collection]}
                </span>
                <div className="flex border border-zinc-700 rounded p-0.5">
                  {(['all', 'selected'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setModeFor(block.id, m)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${blockMode === m ? 'bg-white text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {m === 'all' ? 'All items' : 'Selected…'}
                    </button>
                  ))}
                </div>
              </div>
              {blockMode === 'selected' && (
                <div className="mt-2">
                  <Checkbox
                    checked={allChecked}
                    onChange={on => setInclude(prev => ({ ...prev, [block.id]: on ? [...keys] : [] }))}
                    label={`Select all (${items.length})`}
                    className="mb-1"
                  />
                  <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded p-1 space-y-0.5">
                    {items.map((it, i) => {
                      const key = keys[i];
                      const checked = selected !== undefined && selected.map(String).includes(String(key));
                      return (
                        <div key={String(key)} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-900 text-xs text-zinc-300 cursor-pointer" onClick={() => toggleItem(block.id, key)}>
                          <Checkbox checked={checked} onChange={() => toggleItem(block.id, key)} />
                          <span className="truncate">{itemLabel(scope.collection, it) || String(key)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ModalFooter>
        <button onClick={onClose} className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
        <button onClick={doPrint} className="px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700">Print</button>
      </ModalFooter>
    </Modal>
  );
};

export default ReportPrintDialog;
