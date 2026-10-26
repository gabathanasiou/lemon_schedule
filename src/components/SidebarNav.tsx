import React, { useState } from 'react';
import { Plus, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { inputCls } from '@gabriel/ui-kit';
import { MT_TITLE, MT_ROW, useManagerTableSizes } from '../lib/managerTable';
import { usePaneResize } from '../lib/usePaneResize';
import type { ManagerSearchHit } from '../lib/managerSearch';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';

export interface SidebarNavRow {
  key: string;
  label: string;
  count?: number;
  icon?: React.ElementType;
  dimmed?: boolean;
  italic?: boolean;
  /** Optional section header shown above the row (e.g. crew department). */
  group?: string;
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
  /** Drag-resizable width (right edge). Off by default so manager sidebars are
   *  unchanged; the Script view turns it on with a wider default. */
  resizable?: boolean;
  /** Controlled width (px) — ignored unless `resizable`. */
  width?: number;
  /** Uncontrolled starting width (px). Defaults to the manager sidebar width. */
  defaultWidth?: number;
  onWidthChange?: (w: number) => void;
  /** Let long labels wrap instead of truncating (the Script scene list). */
  wrapRows?: boolean;
  /** Roadmap 172 — deep search inside the records (category + every field).
   *  Shown in the kit's searchable DropdownMenu under the search box. */
  deepSearch?: (query: string) => ManagerSearchHit[];
  onSearchSelect?: (hit: ManagerSearchHit, query: string) => void;
}

const SIDEBAR_MIN_W = 200;
const SIDEBAR_MAX_W = 560;

/** Light-theme master-detail sidebar: title, selectable rows with counts, a
 *  category search box (the kit `inputCls` recipe), a collapse-to-rail toggle
 *  and an add button. Coarse-pointer devices scale the rows/icons via the
 *  shared `useManagerTableSizes` — tracking the kit coarseScale knob like the
 *  Glide reference.
 *
 *  With `deepSearch` the search box drives the kit's searchable DropdownMenu
 *  (controlled `searchValue`, the field itself is the trigger): categories stay
 *  listed for a direct jump, and record hits appear grouped under a clickable
 *  category header. */
export default function SidebarNav({ title, rows, activeKey, onSelect, onAdd, addLabel, addDisabled, renderRowActions, resizable = true, width, defaultWidth, onWidthChange, wrapRows = false, deepSearch, onSearchSelect }: SidebarNavProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const sizes = useManagerTableSizes();
  const [innerWidth, setInnerWidth] = useState(defaultWidth ?? sizes.sidebarW);
  const w = width ?? innerWidth;

  const onResizeDown = usePaneResize({
    width: w,
    min: SIDEBAR_MIN_W,
    max: SIDEBAR_MAX_W,
    edge: 'right',
    onChange: nw => { setInnerWidth(nw); onWidthChange?.(nw); },
  });
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  // Deep search lives in the menu; the sidebar list stays the full list.
  const filtered = searching && !deepSearch ? rows.filter(r => r.label.toLowerCase().includes(q)) : rows;
  const hits = deepSearch && searching ? deepSearch(query) : [];
  const categoriesWithHits = new Set(hits.map(h => h.categoryKey));
  const categoryMatches = deepSearch
    ? rows.filter(r => !categoriesWithHits.has(r.key) && (!searching || r.label.toLowerCase().includes(q)))
    : [];

  const chooseCategory = (key: string) => {
    onSelect(key);
    setQuery('');
    setSearchOpen(false);
  };

  const chooseHit = (hit: ManagerSearchHit) => {
    onSearchSelect?.(hit, query);
    setQuery('');
    setSearchOpen(false);
  };
  if (collapsed) {
    return (
      <div style={{ width: sizes.railW }} className="shrink-0 bg-zinc-50 border-r border-zinc-200 flex flex-col items-center pt-3 island-inset-l">
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
    <div className="relative flex shrink-0" style={{ width: resizable ? w : sizes.sidebarW, maxWidth: '70%' }}>
      <aside data-theme="light" className="min-w-0 flex-1 bg-zinc-50 border-r border-zinc-200 overflow-y-auto island-inset-l">
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
          {deepSearch ? (
            <DropdownMenu
              open={searchOpen}
              onOpenChange={open => { setSearchOpen(open); if (!open) setQuery(''); }}
              theme="light"
              align="left"
              width="min-w-[26rem] max-w-[34rem]"
              maxMenuHeight={480}
              searchable
              searchValue={query}
              onSearchValueChange={setQuery}
              searchFilter={() => true}
              trigger={
                <input
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder={`Search ${title.toLowerCase()} and records…`}
                  className={`${inputCls('sm')} w-full pl-6 pr-6`}
                />
              }
            >
              {categoryMatches.map(row => {
                const Icon = row.icon;
                return (
                  <DropdownItem
                    key={`cat:${row.key}`}
                    onClick={() => chooseCategory(row.key)}
                    icon={Icon ? <Icon className="w-3.5 h-3.5 text-zinc-400" /> : undefined}
                    trailing={row.count !== undefined ? <span className="text-[10px] text-zinc-400 tabular-nums">{row.count}</span> : undefined}
                  >
                    {row.label}
                  </DropdownItem>
                );
              })}
              {hits.map((hit, i) => {
                const showHeader = i === 0 || hits[i - 1].categoryKey !== hit.categoryKey;
                const categoryLabel = rows.find(r => r.key === hit.categoryKey)?.label || hit.categoryLabel;
                return (
                  <React.Fragment key={`row:${hit.categoryKey}:${hit.rowKey}`}>
                    {showHeader && (
                      <DropdownItem
                        onClick={() => chooseCategory(hit.categoryKey)}
                        className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
                        trailing={<span className="text-[9px] font-medium text-zinc-400">Open</span>}
                      >
                        {categoryLabel}
                      </DropdownItem>
                    )}
                    <DropdownItem
                      onClick={() => chooseHit(hit)}
                      trailing={hit.detail ? <span className="text-[10px] text-zinc-400 truncate max-w-[14rem]">{hit.detail}</span> : undefined}
                    >
                      {hit.label}
                    </DropdownItem>
                  </React.Fragment>
                );
              })}
              {categoryMatches.length === 0 && hits.length === 0 && (
                <DropdownItem onClick={() => {}} disabled>No matches</DropdownItem>
              )}
            </DropdownMenu>
          ) : (
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}…`}
              className={`${inputCls('sm')} w-full pl-6 pr-6`}
            />
          )}
          {!deepSearch && query && (
            <button
              onClick={() => setQuery('')}
              onMouseDown={e => e.preventDefault()}
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
          {filtered.map((row, i) => {
            const isActive = row.key === activeKey;
            const Icon = row.icon;
            const actions = renderRowActions?.(row, isActive);
            const showHeader = row.group && (!searching || !!deepSearch) && row.group !== (i > 0 ? filtered[i - 1].group : undefined);
            return (
              <div key={row.key} className="group">
                {showHeader && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    {row.group}
                  </div>
                )}
                <button
                  data-sidebar-row={row.key}
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
                  <span className={`${wrapRows ? 'whitespace-normal break-words' : 'truncate'} flex-1 ${row.italic ? 'italic' : ''}`}>{row.label}</span>
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
        {searching && !deepSearch && filtered.length === 0 && (
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
      {resizable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${title.toLowerCase()} pane`}
          onPointerDown={onResizeDown}
          className="absolute inset-y-0 right-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize touch-none hover:bg-blue-400/40"
        />
      )}
    </div>
  );
}
