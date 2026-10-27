/**
 * Shared class strings for the Day Manager's data tables — one source for the
 * header/cell recipe so every table aligns identically (same padding, same
 * vertical rules, matching alignment per column).
 */
export type DayTableAlign = 'left' | 'center' | 'right';

export const DAY_ALIGN: Record<DayTableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export const DAY_TABLE_WRAP = 'rounded-lg border border-[color:var(--ui-border)] overflow-x-auto';
export const DAY_TABLE = 'w-full border-collapse';
export const DAY_TH = 'text-[10px] font-semibold text-[color:var(--ui-text-muted)] uppercase tracking-wider px-2.5 py-2 whitespace-nowrap bg-[var(--ui-card-bg)] border-r border-[color:var(--ui-border)] last:border-r-0';
export const DAY_TD = 'px-2.5 py-1.5 align-middle border-r border-[color:var(--ui-border)] last:border-r-0';
export const DAY_GROUP_ROW = 'bg-[var(--ui-card-band)] border-b border-[color:var(--ui-border)]';

/** Light inline input inside a Day Manager table (width/padding appended). */
export const DAY_INPUT = 'bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border-strong)] rounded text-xs text-[color:var(--ui-text-strong)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)] focus:ring-1 focus:ring-[color:var(--ui-input-focus-border)]';
