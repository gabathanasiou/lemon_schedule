import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Plus, Rows3 } from 'lucide-react';
import type { BudgetSettings } from '../../types';
import { formatMoney } from '../../lib/budget/format';
import { usePaneResize } from '../../lib/usePaneResize';

export interface CategoryRailItem {
  id: string;
  number: string;
  name: string;
  /** Right-aligned secondary figure: % of grand in Budget, % used in Cost. */
  meta: string;
  /** Headline amount for the mode: budget total or EFC. */
  amountCents: number;
  /** Optional line under the amount (cost variance). */
  detail?: string;
  detailTone?: 'good' | 'bad';
  /** Cost mode keeps out-of-budget categories visible with a cue. */
  notInBudget?: boolean;
}

const RAIL_DEFAULT_W = 208;
const RAIL_MIN_W = 168;
const RAIL_MAX_W = 380;
const RAIL_COLLAPSED_W = 40;

/**
 * The Budget page's category rail (roadmap 339/349, resize/collapse 355).
 * Navigation only: it filters the sheet to one category and never edits the
 * chart. The right-click menu is authoring-only, so the Cost Report mode gets
 * the same rail without the category manager. Collapse/resize matches the
 * Element Manager's `SidebarNav` (shared `usePaneResize`); the width is a
 * session preference, like the manager sidebars.
 */
export function CategoryRail({
  items, settings, focusCategoryId, onFocus, mode, readOnly,
  onAddCategory, onMenu,
}: {
  items: CategoryRailItem[];
  settings: BudgetSettings;
  focusCategoryId: string | null;
  onFocus: (id: string | null) => void;
  mode: 'budget' | 'cost';
  readOnly: boolean;
  onAddCategory?: () => void;
  onMenu?: (event: React.MouseEvent, categoryId?: string) => void;
}) {
  const canMenu = !readOnly && mode === 'budget' && !!onMenu;
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(RAIL_DEFAULT_W);
  const onResizeDown = usePaneResize({
    width,
    min: RAIL_MIN_W,
    max: RAIL_MAX_W,
    edge: 'right',
    onChange: setWidth,
  });

  if (collapsed) {
    return (
      <div
        className="relative w-10 shrink-0 border-r border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] flex flex-col items-center gap-1 pt-2"
        data-budget-category-rail
        data-collapsed="true"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1 rounded text-[color:var(--ui-text-muted)] hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text-strong)]"
          title="Show categories"
          aria-label="Show categories"
        >
          <PanelLeftOpen className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onFocus(null)}
          className={`p-1 rounded ${focusCategoryId === null ? 'bg-[var(--ui-item-hover-bg)] text-[color:var(--ui-text-strong)]' : 'text-[color:var(--ui-text-muted)] hover:bg-[var(--ui-item-hover-bg)]'}`}
          title="All categories"
          aria-label="All categories"
        >
          <Rows3 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 border-r border-[color:var(--ui-border)] overflow-y-auto scrollbar-custom bg-[var(--ui-panel-bg)]"
      style={{ width }}
      onContextMenu={(e) => {
        if (!canMenu) return;
        e.preventDefault();
        onMenu?.(e);
      }}
      data-budget-category-rail
    >
      <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 border-b border-[color:var(--ui-border)]">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ui-text-faint)]">Categories</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-0.5 rounded text-[color:var(--ui-text-faint)] hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text-strong)]"
          title="Hide categories"
          aria-label="Hide categories"
        >
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onFocus(null)}
        className={`w-full text-left px-3 py-2 text-xs border-b border-l-2 border-[color:var(--ui-border)] ${focusCategoryId === null ? 'border-l-[color:var(--ui-accent-header-fill)] bg-[var(--ui-item-hover-bg)] font-semibold text-[color:var(--ui-text-strong)]' : 'border-l-transparent text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-item-hover-bg)]'}`}
      >
        All categories
      </button>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onFocus(focusCategoryId === item.id ? null : item.id)}
          onContextMenu={(e) => {
            if (!canMenu) return;
            e.preventDefault();
            e.stopPropagation();
            onMenu?.(e, item.id);
          }}
          className={`w-full text-left px-3 py-2 border-b border-l-2 border-[color:var(--ui-border)] ${focusCategoryId === item.id ? 'border-l-[color:var(--ui-accent-header-fill)] bg-[var(--ui-item-hover-bg)] font-semibold text-[color:var(--ui-text-strong)]' : 'border-l-transparent text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-item-hover-bg)]'}`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold truncate">
              {item.number} {item.name}
              {item.notInBudget && (
                <span className="ml-1 text-[9px] font-normal text-[color:var(--ui-text-faint)]">not in budget</span>
              )}
            </span>
            <span className="text-[10px] shrink-0">{item.meta}</span>
          </div>
          <div className="flex items-baseline justify-between gap-1 text-[10px] opacity-80">
            <span>{formatMoney(item.amountCents, settings)}</span>
            {item.detail && (
              <span className={item.detailTone === 'good' ? 'text-emerald-700' : item.detailTone === 'bad' ? 'text-red-600' : undefined}>
                {item.detail}
              </span>
            )}
          </div>
        </button>
      ))}
      {!readOnly && mode === 'budget' && onAddCategory && (
        <button
          type="button"
          onClick={onAddCategory}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] text-[color:var(--ui-text-muted)] hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text-strong)]"
          data-budget-new-category
        >
          <Plus className="w-3 h-3" /> New category
        </button>
      )}
      <div
        onPointerDown={onResizeDown}
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-blue-400/40"
        title="Resize categories"
        data-budget-rail-resize
      />
    </div>
  );
}
