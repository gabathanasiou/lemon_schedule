import React from 'react';
import { Check, Trash2, Tag } from 'lucide-react';
import { RibbonCell } from '../../types';
import { FIELD_ICONS, getCustomIcon } from './ribbonPaletteMeta';

export interface SelCellRef {
  row: { id: string; cells: RibbonCell[] };
  ci: number;
  cell: RibbonCell;
}

interface RibbonContextMenuProps {
  contextPos: { x: number; y: number } | null;
  setContextPos: (p: { x: number; y: number } | null) => void;
  selCell: SelCellRef | null;
  setSelId: (id: string | null) => void;
  allFields: { key: string; label: string }[];
  customCategories: { key: string; icon?: string }[] | undefined;
  assign: (cellId: string, key: string) => void;
  setAffix: (cellId: string, which: 'prefix' | 'suffix', value: string) => void;
  setTextContent: (cellId: string, text: string) => void;
  clearCell: (cellId: string) => void;
  removeColumn: (ci: number) => void;
}

export default function RibbonContextMenu({
  contextPos, setContextPos, selCell, setSelId, allFields, customCategories,
  assign, setAffix, setTextContent, clearCell, removeColumn,
}: RibbonContextMenuProps) {
  if (!contextPos || !selCell) return null;
  return (
    <>
      <div className="fixed inset-0 z-[110]" onClick={() => setContextPos(null)} onContextMenu={e => {
        e.preventDefault();
        const backdrop = e.currentTarget as HTMLElement;
        backdrop.style.pointerEvents = 'none';
        const el = document.elementFromPoint(e.clientX, e.clientY);
        backdrop.style.pointerEvents = '';
        const cellDiv = el?.closest('[data-cell-id]') as HTMLElement | null;
        if (cellDiv) {
          const cid = cellDiv.getAttribute('data-cell-id');
          if (cid) { setSelId(cid); setContextPos({ x: e.clientX, y: e.clientY }); return; }
        }
        setContextPos(null);
      }} />
      <div
        className="fixed z-[120] bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl p-1 flex flex-col max-h-96 w-52"
        style={{ left: Math.max(0, Math.min(contextPos.x, window.innerWidth - 220)), top: Math.max(0, Math.min(contextPos.y, window.innerHeight - 420)) }}
      >
        <div
          ref={el => {
            if (el && selCell) {
              const active = el.querySelector(`[data-field-key="${(selCell.cell as any).field}"]`) as HTMLElement;
              if (active) active.scrollIntoView({ block: 'nearest' });
            }
          }}
          className="overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' } as React.CSSProperties}>
          {allFields.map(f => {
            const catDef = (customCategories || []).find(c => c.key === f.key);
            const Icon = FIELD_ICONS[f.key] || (catDef ? getCustomIcon(catDef.icon) : Tag);
            const isActive = f.key === (selCell.cell as any).field;
            return (
              <button
                key={f.key}
                data-field-key={f.key}
                onClick={() => { assign(selCell.cell.id, f.key); setContextPos(null); }}
                className={`w-full text-left px-3 py-2 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 ${isActive ? 'bg-blue-600/30 text-blue-300' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
              >
                {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-400'}`} />}
                <span className="truncate flex-1">{f.label}</span>
                {isActive && <Check className="w-3 h-3 text-blue-400 shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-zinc-800 pt-2">

          {selCell.cell.field && selCell.cell.field !== 'text' && (
            <div className="flex items-center gap-1 px-1 mb-1.5">
              <span className="text-[9px] text-zinc-600 shrink-0">Pfx</span>
              <input
                value={(selCell.cell as any).prefix || ''}
                onChange={e => setAffix(selCell.cell.id, 'prefix', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setContextPos(null); }}
                placeholder=""
                className="flex-1 min-w-0 px-1.5 py-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
              <span className="text-[9px] text-zinc-600 shrink-0">Sfx</span>
              <input
                value={(selCell.cell as any).suffix || ''}
                onChange={e => setAffix(selCell.cell.id, 'suffix', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setContextPos(null); }}
                placeholder=""
                className="flex-1 min-w-0 px-1.5 py-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            </div>
          )}

          {selCell.cell.field === 'text' && (
            <div className="px-1 mb-1">
              <input
                value={(selCell.cell as any).textContent || ''}
                onChange={e => setTextContent(selCell.cell.id, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setContextPos(null); }}
                placeholder="Text content..."
                className="w-full px-1.5 py-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            </div>
          )}

          <button
            onClick={() => { clearCell(selCell.cell.id); setContextPos(null); }}
            className="w-full text-left px-3 py-2 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">Clear field</span>
          </button>
          <button
            onClick={() => { removeColumn(selCell.ci); setContextPos(null); }}
            className="w-full text-left px-3 py-2 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 text-red-400 hover:bg-rose-950/40 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">Delete Column</span>
          </button>
        </div>
      </div>
    </>
  );
}
