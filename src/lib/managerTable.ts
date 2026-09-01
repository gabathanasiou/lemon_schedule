import { useCoarseSize, coarsePx, useCoarseScale } from '@gabriel/ui-kit';

/**
 * Manager-page table + sidebar sizing that tracks the kit's coarseScale knob
 * exactly like the kit `Button`: `useCoarseSize`/`coarsePx` interpolate
 * desktop→full-coarse by the global scale (default 0.5 = the 50% bump the kit
 * feeds everywhere). The STATIC chrome (colors, borders, alignment) stays in
 * the `MT_*` class strings below; the SIZING (padding / font-size / icon px)
 * comes back as inline styles from `useManagerTableSizes()` and is applied with
 * `style={…}` on the cells/rows — so the tables scale in lockstep with the
 * buttons/menus around them instead of jumping to a full-coarse size.
 */

/** Table cell input chrome (padding/font via `sizes.input` inline). */
export const MT_INPUT = 'w-full bg-transparent text-zinc-800 outline-none rounded focus:bg-white focus:ring-1 focus:ring-zinc-400 transition-shadow';

/** Table header cell chrome (padding/font via `sizes.header` inline). */
export const MT_HEADER = 'font-semibold text-zinc-400 uppercase tracking-wider';

/** Plain data cell chrome (padding/font via `sizes.cell` inline). */
export const MT_CELL = 'border-r border-zinc-200';

/** Small data cell chrome (padding/font via `sizes.cellSmall` inline). */
export const MT_CELL_SMALL = 'border-r border-zinc-200 text-zinc-400';

/** Footer "Add" button chrome (padding/font via `sizes.add` inline). */
export const MT_ADD = 'flex items-center gap-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors w-full disabled:opacity-40 disabled:cursor-not-allowed';

/** Sidebar category row chrome (padding/font via `sizes.row` inline). */
export const MT_ROW = 'w-full text-left rounded-md transition-colors flex items-center gap-2';

/** Sidebar title chrome (font via `sizes.title` inline). */
export const MT_TITLE = 'font-semibold text-zinc-400 uppercase tracking-wider';

export interface ManagerTableSizes {
  input: { padding: string; fontSize: string };
  header: { padding: string; fontSize: string };
  cell: { padding: string; fontSize: string };
  cellSmall: { padding: string; fontSize: string };
  add: { padding: string; fontSize: string };
  row: { padding: string; fontSize: string };
  title: { fontSize: string };
  icon: number;
  iconSm: number;
  sidebarW: number;
  railW: number;
}

/** Interpolated manager sizing — desktop at scale 0, full-coarse at scale 1,
 *  the kit's 50% midpoint at the default 0.5. The coarse TARGETS match the
 *  Glide breakdown (the app's coarse reference): ~12.5px text at the default
 *  0.5, modest cell padding. */
export function useManagerTableSizes(): ManagerTableSizes {
  const input = useCoarseSize({ px: 8, py: 4, fs: 12 }, { px: 12, py: 8, fs: 13 });
  const header = useCoarseSize({ px: 12, py: 8, fs: 10 }, { px: 12, py: 10, fs: 12 });
  const cell = useCoarseSize({ px: 12, py: 4, fs: 12 }, { px: 12, py: 8, fs: 13 });
  const cellSmall = useCoarseSize({ px: 12, py: 4, fs: 11 }, { px: 12, py: 8, fs: 13 });
  const add = useCoarseSize({ px: 12, py: 8, fs: 12 }, { px: 12, py: 10, fs: 13 });
  const row = useCoarseSize({ px: 8, py: 6, fs: 12 }, { px: 12, py: 10, fs: 13 });
  const title = useCoarseSize({ px: 0, py: 0, fs: 10 }, { px: 0, py: 0, fs: 11 });
  const scale = useCoarseScale();
  const icon = coarsePx(14, 16, scale);
  const iconSm = coarsePx(12, 15, scale);
  const sidebarW = coarsePx(188, 212, scale);
  const railW = coarsePx(36, 44, scale);
  return { input, header, cell, cellSmall, add, row, title, icon, iconSm, sidebarW, railW };
}
