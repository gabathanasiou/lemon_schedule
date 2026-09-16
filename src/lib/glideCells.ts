import React from 'react';
import type { GridCell } from '@glideapps/glide-data-grid';
import { GridCellKind } from '@glideapps/glide-data-grid';

/** Builds a plain text Glide grid cell. */
export function textCell(data: string, opts?: Partial<{ readonly: boolean; displayData: string; allowOverlay: boolean; align: 'left' | 'right' | 'center'; cursor?: React.CSSProperties['cursor']; themeOverride?: { bgCell?: string; textDark?: string }; selectionRange?: number | readonly [number, number] }>): GridCell {
  return {
    kind: GridCellKind.Text,
    data,
    displayData: opts?.displayData ?? data,
    allowOverlay: opts?.allowOverlay ?? true,
    readonly: opts?.readonly ?? false,
    contentAlign: opts?.align,
    cursor: opts?.cursor,
    themeOverride: opts?.themeOverride,
    selectionRange: opts?.selectionRange,
  } as GridCell;
}

/**
 * Builds a cell whose EDITOR opens on `editValue` fully selected. The overlay
 * editor seeds from the cell's `data` (never `displayData`), so resolved-value
 * grids — a call time computed from the stage chain, a crew call resolved from
 * a precall — must put the displayed text in `data` to be visible when editing.
 * `displayData` still drives the rendered (computed) text. Typing replaces the
 * whole value, the `CellInput` `clearOnType` model; the caller must ignore an
 * unchanged commit so no spurious override is stored.
 */
export function seededTextCell(editValue: string, opts?: Parameters<typeof textCell>[1]): GridCell {
  return textCell(editValue, {
    ...opts,
    selectionRange: editValue.length > 0 ? ([0, editValue.length] as const) : undefined,
  });
}

/**
 * True when a commit must be ignored: it only re-states what the editor was
 * seeded with — the stored override, the default expression (`-1h` lead /
 * department precall) or the resolved time — or clears an already-empty cell.
 * Without this, Enter/blur on a seeded cell would pin a spurious override.
 */
export function isSeededNoop(prior: string, seed: string, value: string): boolean {
  const v = value.trim();
  if (v === '') return !prior;
  return v === (prior || seed).trim();
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
