import React from 'react';
import { Plus } from 'lucide-react';

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

/** Light-theme master-detail sidebar: title, selectable rows with counts, add button. */
export default function SidebarNav({ title, rows, activeKey, onSelect, onAdd, addLabel, addDisabled, renderRowActions }: SidebarNavProps) {
  return (
    <aside className="w-[188px] shrink-0 bg-zinc-50 border-r border-zinc-200 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-zinc-50 px-3 pt-3 pb-1.5">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="px-3 pb-20">
        <div className="space-y-0.5">
          {rows.map(row => {
            const isActive = row.key === activeKey;
            const Icon = row.icon;
            const actions = renderRowActions?.(row, isActive);
            return (
              <div key={row.key} className="group">
                <button
                  onClick={() => onSelect(row.key)}
                  className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 text-xs ${
                    row.dimmed
                      ? 'text-zinc-400 hover:bg-zinc-100 font-medium opacity-60'
                      : isActive
                      ? 'bg-zinc-900 text-white font-semibold'
                      : 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 font-medium'
                  }`}
                >
                  {Icon && <Icon className={`w-3 h-3 shrink-0 ${isActive ? 'text-white' : row.dimmed ? 'text-zinc-300' : 'text-zinc-400'}`} />}
                  <span className={`truncate flex-1 ${row.italic ? 'italic' : ''}`}>{row.label}</span>
                  {actions && (
                    <span className={`flex items-center gap-0.5 shrink-0 ${row.dimmed ? '' : 'hover-reveal'}`} onClick={e => e.stopPropagation()}>
                      {actions}
                    </span>
                  )}
                  {row.count !== undefined && (
                    <span className={`text-[10px] tabular-nums shrink-0 ${isActive ? 'text-zinc-400' : row.dimmed ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      {row.count}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            disabled={addDisabled}
            className="w-full text-left px-2 py-1.5 mt-1 rounded-md text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3 shrink-0" />
            <span>{addLabel || 'Add'}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
