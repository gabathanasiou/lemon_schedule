import React, { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * ItemCard — the collapsible group card of the element events manager's
 * day-type sections (roadmap 46), extracted so every "one card per item,
 * rows inside" surface in a dark modal can use it (the Rules section of the
 * same modal is the first migration; RulesTab's cast groups and the day
 * types manager are candidates).
 *
 * Header: chevron + icon + title + count on the zinc-800 card, with an
 * optional right-aligned `trailing` action (e.g. "Add Rule") OUTSIDE the
 * toggle button (never nest a button inside the toggle). Body renders the
 * dark band (`border-t bg-zinc-900/60 p-1.5 space-y-1` — rows sit with gaps,
 * no dividers) unless `bodyClass` overrides it.
 *
 * Dark theme only — a light variant belongs to the RulesTab migration.
 */
export interface ItemCardProps {
  /** Header title (label or node). */
  title: ReactNode;
  /** Leading icon (day-type icon, section icon). */
  icon?: ReactNode;
  /** Trailing count badge (e.g. "3 days" or "2 rules"). */
  count?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  /** Right-aligned header actions (e.g. "Add Rule"). */
  trailing?: ReactNode;
  /** Body wrapper classes (default = the dark band). */
  bodyClass?: string;
  /** data-* attributes for tests/agents (e.g. `{ 'data-element-event-type': 'travel' }`). */
  dataProps?: Record<string, string>;
  children?: ReactNode;
}

export function ItemCard({ title, icon, count, collapsed, onToggle, trailing, bodyClass, dataProps, children }: ItemCardProps) {
  return (
    <div {...dataProps} className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 hover:bg-zinc-700/50 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
          {icon}
          <span className="text-xs font-semibold text-zinc-200 truncate">{title}</span>
          {count && <span className="text-[10px] text-zinc-500 shrink-0">{count}</span>}
        </button>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
      {!collapsed && children && (
        <div className={bodyClass || 'border-t border-zinc-700/60 bg-zinc-900/60 divide-y divide-zinc-700/60 p-1.5'}>{children}</div>
      )}
    </div>
  );
}
