import React from 'react';
import type { GridCell } from '@glideapps/glide-data-grid';
import { GridCellKind } from '@glideapps/glide-data-grid';
import { Scene } from '../types';

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

/** Serializes the selection range into tab-separated clipboard text. */
export function buildCopyText(scenes: Scene[], columns: GlideColumnDef[], range: { x: number; y: number; width: number; height: number }): string {
  const { x, y, width, height } = range;
  const rows: string[] = [];
  for (let r = y; r < y + height; r++) {
    if (r >= scenes.length) break;
    const cols: string[] = [];
    for (let c = x; c < x + width; c++) {
      const key = columns[c]?.key;
      if (key === 'actions') continue;
      cols.push(String((scenes[r] as any)[key] ?? ''));
    }
    rows.push(cols.join('\t'));
  }
  return rows.join('\n');
}

export interface CutCommit {
  row: number;
  colKey: string;
}

/** Builds clipboard text + the cells to clear for a cut operation. */
export function buildCutPlan(scenes: Scene[], columns: GlideColumnDef[], range: { x: number; y: number; width: number; height: number }): { text: string; committers: CutCommit[] } {
  const { x, y, width, height } = range;
  const rows: string[] = [];
  const committers: CutCommit[] = [];
  for (let r = y; r < y + height; r++) {
    if (r >= scenes.length) continue;
    const cols: string[] = [];
    for (let c = x; c < x + width; c++) {
      const key = columns[c]?.key;
      if (!key || key === 'actions') continue;
      cols.push(String((scenes[r] as any)[key] ?? ''));
      committers.push({ row: r, colKey: key });
    }
    rows.push(cols.join('\t'));
  }
  return { text: rows.join('\n'), committers };
}
