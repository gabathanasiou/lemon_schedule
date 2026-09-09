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

export const DAY_TABLE_WRAP = 'rounded-lg border border-zinc-200 overflow-x-auto';
export const DAY_TABLE = 'w-full border-collapse';
export const DAY_TH = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2.5 py-2 whitespace-nowrap bg-zinc-50 border-r border-zinc-200 last:border-r-0';
export const DAY_TD = 'px-2.5 py-1.5 align-middle border-r border-zinc-200/70 last:border-r-0';
export const DAY_GROUP_ROW = 'bg-zinc-100/80 border-b border-zinc-200';
