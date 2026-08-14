import React from 'react';
import type { GridCell } from '@glideapps/glide-data-grid';
import { GridCellKind } from '@glideapps/glide-data-grid';

/** Builds a plain text Glide grid cell. */
export function textCell(data: string, opts?: Partial<{ readonly: boolean; displayData: string; allowOverlay: boolean; align: 'left' | 'right' | 'center'; cursor?: React.CSSProperties['cursor']; themeOverride?: { bgCell?: string } }>): GridCell {
  return {
    kind: GridCellKind.Text,
    data,
    displayData: opts?.displayData ?? data,
    allowOverlay: opts?.allowOverlay ?? true,
    readonly: opts?.readonly ?? false,
    contentAlign: opts?.align,
    cursor: opts?.cursor,
    themeOverride: opts?.themeOverride,
  } as GridCell;
}

export interface GlideColumnDef {
  key: string;
  label: string;
  width: number;
}

/** Serializes the selection range into tab-separated clipboard text. Rows are flat objects read by column key. */
export function buildCopyText(rows: any[], columns: GlideColumnDef[], range: { x: number; y: number; width: number; height: number }): string {
  const { x, y, width, height } = range;
  const lines: string[] = [];
  for (let r = y; r < y + height; r++) {
    if (r >= rows.length) break;
    const cols: string[] = [];
    for (let c = x; c < x + width; c++) {
      const key = columns[c]?.key;
      if (key === 'actions') continue;
      cols.push(String((rows[r] as any)[key] ?? ''));
    }
    lines.push(cols.join('\t'));
  }
  return lines.join('\n');
}

export interface CutCommit {
  row: number;
  colKey: string;
}

/** Builds clipboard text + the cells to clear for a cut operation. */
export function buildCutPlan(rows: any[], columns: GlideColumnDef[], range: { x: number; y: number; width: number; height: number }): { text: string; committers: CutCommit[] } {
  const { x, y, width, height } = range;
  const lines: string[] = [];
  const committers: CutCommit[] = [];
  for (let r = y; r < y + height; r++) {
    if (r >= rows.length) continue;
    const cols: string[] = [];
    for (let c = x; c < x + width; c++) {
      const key = columns[c]?.key;
      if (!key || key === 'actions') continue;
      cols.push(String((rows[r] as any)[key] ?? ''));
      committers.push({ row: r, colKey: key });
    }
    lines.push(cols.join('\t'));
  }
  return { text: lines.join('\n'), committers };
}
