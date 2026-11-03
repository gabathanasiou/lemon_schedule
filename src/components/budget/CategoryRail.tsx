import React from 'react';
import { Plus } from 'lucide-react';
import type { BudgetSettings } from '../../types';
import { formatMoney } from '../../lib/budget/format';

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

/**
 * The Budget page's category rail (roadmap 339/349). Navigation only: it
 * filters the sheet to one category and never edits the chart. The right-click
 * menu is authoring-only, so the Cost Report mode gets the same rail without
 * the category manager.
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
  return (
    <div
      className="w-52 shrink-0 border-r border-[color:var(--ui-border)] overflow-y-auto scrollbar-custom bg-[var(--ui-panel-bg)]"
      onContextMenu={(e) => {
        if (!canMenu) return;
        e.preventDefault();
        onMenu?.(e);
      }}
      data-budget-category-rail
    >
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
    </div>
  );
}
