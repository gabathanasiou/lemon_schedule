import { RibbonCell } from '../../types';

/** Filters cells by print options (hide call-time / duration columns) and rebalances widths to 100%. */
export function filterIndices(cells: RibbonCell[], colWidths: number[], showTimes: boolean, showDurations: boolean): { keep: boolean[]; filteredWidths: number[] } {
  const keep: boolean[] = cells.map(c => {
    if (c.field === 'callTime' && !showTimes) return false;
    if (c.field === 'duration' && !showDurations) return false;
    return true;
  });
  if (keep.every(k => k)) return { keep, filteredWidths: colWidths };
  const filteredWidths: number[] = [];
  for (let i = 0; i < colWidths.length; i++) {
    if (keep[i]) filteredWidths.push(colWidths[i]);
  }
  if (filteredWidths.length === 0) return { keep, filteredWidths };
  const total = filteredWidths.reduce((s, w) => s + w, 0);
  if (total <= 0) return { keep, filteredWidths };
  const scale = 100 / total;
  for (let i = 0; i < filteredWidths.length; i++) {
    filteredWidths[i] = Math.round(filteredWidths[i] * scale * 100) / 100;
  }
  return { keep, filteredWidths };
}

export function filterCells(cells: RibbonCell[], keep: boolean[]): RibbonCell[] {
  return cells.filter((_, i) => keep[i]);
}
