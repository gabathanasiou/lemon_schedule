import React, { useState } from 'react';
import { Plus, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { inputCls } from '@gabriel/ui-kit';
import { MT_TITLE, MT_ROW, useManagerTableSizes } from '../lib/managerTable';

export interface SidebarNavRow {
  key: string;
  label: string;
  count?: number;
  icon?: React.ElementType;
  dimmed?: boolean;
  italic?: boolean;
}

interface SidebarNavProps {
  title: string;
  rows: SidebarNavRow[];
  activeKey: string;
  onSelect: (key: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  addDisabled?: boolean;
  renderRowActions?: (row: SidebarNavRow, active: boolean) => React.ReactNode;
}

/** Light-theme master-detail sidebar: title, selectable rows with counts, a
 *  category search box (the kit `inputCls` recipe), a collapse-to-rail toggle
 *  and an add button. Coarse-pointer devices scale the rows/icons via the
 *  shared `useManagerTableSizes` — tracking the kit coarseScale knob like the
 *  Glide reference. */
export default function SidebarNav({ title, rows, activeKey, onSelect, onAdd, addLabel, addDisabled, renderRowActions }: SidebarNavProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const sizes = useManagerTableSizes();
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const filtered = searching ? rows.filter(r => r.label.toLowerCase().includes(q)) : rows;

  if (collapsed) {
    return (
      <div style={{ width: sizes.railW }} className="shrink-0 bg-zinc-50 border-r border-zinc-200 flex flex-col items-center pt-3">
        <button
          onClick={() => setCollapsed(false)}
          className="text-zinc-400 hover:text-zinc-700 transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <aside data-theme="light" style={{ width: sizes.sidebarW }} className="shrink-0 bg-zinc-50 border-r border-zinc-200 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-zinc-50 px-3 pt-3 pb-1.5">
        <div className="flex items-center justify-between gap-2">
          <span style={{ fontSize: sizes.title.fontSize }} className={MT_TITLE}>{title}</span>
          <button
            onClick={() => setCollapsed(true)}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="relative mt-2 mb-1">
          <Search className="w-3 h-3 text-zinc-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            className={`${inputCls('sm')} w-full pl-6 pr-6`}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="px-3 pb-20">
        <div className="space-y-0.5">
          {filtered.map(row => {
            const isActive = row.key === activeKey;
            const Icon = row.icon;
            const actions = renderRowActions?.(row, isActive);
            return (
              <div key={row.key} className="group">
                <button
                  onClick={() => onSelect(row.key)}
                  style={sizes.row}
                  className={`${MT_ROW} ${
                    row.dimmed
                      ? 'text-zinc-400 hover:bg-zinc-100 font-medium opacity-60'
                      : isActive
                      ? 'bg-zinc-900 text-white font-semibold'
                      : 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 font-medium'
                  }`}
                >
                  {Icon && <Icon style={{ width: sizes.iconSm, height: sizes.iconSm }} className={`shrink-0 ${isActive ? 'text-white' : row.dimmed ? 'text-zinc-300' : 'text-zinc-400'}`} />}
                  <span className={`truncate flex-1 ${row.italic ? 'italic' : ''}`}>{row.label}</span>
                  {actions && (
                    <span className={`flex items-center gap-0.5 shrink-0 ${row.dimmed ? '' : 'hover-reveal'}`} onClick={e => e.stopPropagation()}>
                      {actions}
                    </span>
                  )}
                  {row.count !== undefined && (
                    <span style={{ fontSize: sizes.title.fontSize }} className={`tabular-nums shrink-0 ${isActive ? 'text-zinc-400' : row.dimmed ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      {row.count}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        {searching && filtered.length === 0 && (
          <div className="px-1 py-2 text-[10px] text-zinc-400 italic">No {title.toLowerCase()} match “{query}”.</div>
        )}
        {onAdd && (
          <button
            onClick={onAdd}
            disabled={addDisabled}
            style={sizes.row}
            className={`${MT_ROW} mt-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Plus style={{ width: sizes.iconSm, height: sizes.iconSm }} className="shrink-0" />
            <span>{addLabel || 'Add'}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
