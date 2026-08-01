import { RibbonRow } from '../types';

export interface MergeGroup {
  colIndex: number;
  rowIndex: number;
  field: string;
  span: number;
  direction: 'h' | 'v';
}

export function computeMergeGroups(rows: RibbonRow[]): MergeGroup[] {
  if (rows.length < 2 && rows.every(r => r.cells.length < 2)) return [];

  const horizontal: MergeGroup[] = [];
  const hOccupied = new Set<string>();

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    let runStart = -1;
    let runField = '';
    for (let ci = 0; ci < row.cells.length; ci++) {
      const field = row.cells[ci]?.field || '';
      if (field && field === runField) continue;
      if (runStart >= 0 && ci - runStart >= 2) {
        horizontal.push({ colIndex: runStart, rowIndex: ri, field: runField, span: ci - runStart, direction: 'h' });
        for (let cj = runStart; cj < ci; cj++) hOccupied.add(row.cells[cj].id);
      }
      runStart = field ? ci : -1;
      runField = field;
    }
    if (runStart >= 0 && row.cells.length - runStart >= 2) {
      horizontal.push({ colIndex: runStart, rowIndex: ri, field: runField, span: row.cells.length - runStart, direction: 'h' });
      for (let cj = runStart; cj < row.cells.length; cj++) hOccupied.add(row.cells[cj].id);
    }
  }

  const vertical: MergeGroup[] = [];
  const maxCols = Math.max(...rows.map(r => r.cells.length));
  for (let ci = 0; ci < maxCols; ci++) {
    let runStart = -1;
    let runField = '';
    for (let ri = 0; ri < rows.length; ri++) {
      const cell = rows[ri].cells[ci];
      const field = cell?.field || '';
      const blocked = hOccupied.has(cell?.id || '');
      if (field && !blocked && field === runField) continue;
      if (runStart >= 0 && ri - runStart >= 2) {
        vertical.push({ colIndex: ci, rowIndex: runStart, field: runField, span: ri - runStart, direction: 'v' });
      }
      runStart = (field && !blocked) ? ri : -1;
      runField = (field && !blocked) ? field : '';
    }
    if (runStart >= 0 && rows.length - runStart >= 2) {
      vertical.push({ colIndex: ci, rowIndex: runStart, field: runField, span: rows.length - runStart, direction: 'v' });
    }
  }

  return [...horizontal, ...vertical];
}

export function getMergeLookup(rows: RibbonRow[]): Map<string, { group: MergeGroup; isLead: boolean }> {
  const groups = computeMergeGroups(rows);
  const map = new Map<string, { group: MergeGroup; isLead: boolean }>();
  for (const g of groups) {
    if (g.direction === 'v') {
      const leadCell = rows[g.rowIndex]?.cells[g.colIndex];
      if (leadCell) map.set(leadCell.id, { group: g, isLead: true });
      for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
        const cell = rows[ri]?.cells[g.colIndex];
        if (cell) map.set(cell.id, { group: g, isLead: false });
      }
    } else {
      const leadCell = rows[g.rowIndex]?.cells[g.colIndex];
      if (leadCell) map.set(leadCell.id, { group: g, isLead: true });
      for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
        const cell = rows[g.rowIndex]?.cells[ci];
        if (cell) map.set(cell.id, { group: g, isLead: false });
      }
    }
  }
  return map;
}

export function mergeSiblingIds(cellId: string, rows: RibbonRow[]): string[] {
  const groups = computeMergeGroups(rows);
  for (const g of groups) {
    if (g.direction === 'v') {
      for (let ri = g.rowIndex; ri < g.rowIndex + g.span; ri++) {
        if (rows[ri]?.cells[g.colIndex]?.id === cellId) {
          const ids: string[] = [];
          for (let ri2 = g.rowIndex; ri2 < g.rowIndex + g.span; ri2++) {
            const c = rows[ri2]?.cells[g.colIndex];
            if (c) ids.push(c.id);
          }
          return ids;
        }
      }
    } else {
      for (let ci = g.colIndex; ci < g.colIndex + g.span; ci++) {
        if (rows[g.rowIndex]?.cells[ci]?.id === cellId) {
          const ids: string[] = [];
          for (let ci2 = g.colIndex; ci2 < g.colIndex + g.span; ci2++) {
            const c = rows[g.rowIndex]?.cells[ci2];
            if (c) ids.push(c.id);
          }
          return ids;
        }
      }
    }
  }
  return [cellId];
}
