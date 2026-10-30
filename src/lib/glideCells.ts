import React from 'react';
import type { CustomCell, CustomRenderer, GridCell } from '@glideapps/glide-data-grid';
import { GridCellKind } from '@glideapps/glide-data-grid';

/** Builds a plain text Glide grid cell. */
export function textCell(data: string, opts?: Partial<{ readonly: boolean; displayData: string; allowOverlay: boolean; align: 'left' | 'right' | 'center'; cursor?: React.CSSProperties['cursor']; themeOverride?: { bgCell?: string; textDark?: string; textMedium?: string; textLight?: string }; selectionRange?: number | readonly [number, number] }>): GridCell {
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

/** Synthetic lanes that are never clipboard data (row actions, the trailing
 *  (i), the budget band disclosure). Copy/cut skip them so a pasted block
 *  never carries an empty leading/trailing tab. */
const SYNTHETIC_COLUMN_KEYS = new Set(['actions', 'info', 'disclosure']);

/** Serializes the selection range into tab-separated clipboard text. Rows are flat objects read by column key. */
export function buildCopyText(rows: any[], columns: GlideColumnDef[], range: { x: number; y: number; width: number; height: number }): string {
  const { x, y, width, height } = range;
  const lines: string[] = [];
  for (let r = y; r < y + height; r++) {
    if (r >= rows.length) break;
    const cols: string[] = [];
    for (let c = x; c < x + width; c++) {
      const key = columns[c]?.key;
      if (!key || SYNTHETIC_COLUMN_KEYS.has(key)) continue;
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
      if (!key || SYNTHETIC_COLUMN_KEYS.has(key)) continue;
      cols.push(String((rows[r] as any)[key] ?? ''));
      committers.push({ row: r, colKey: key });
    }
    lines.push(cols.join('\t'));
  }
  return { text: lines.join('\n'), committers };
}


// ---- app glyph: an info (i) button ----------------------------------------
// The kit's glyph cells cover plus/trash/chevron/check; row editors that look
// like navigation (category/account/line details) need an info affordance, not
// a chevron (which reads as collapse/expand). ONE shared custom cell + renderer.

export interface InfoGlyphCellData {
  kind: 'lemon-info';
  label: string;
  onActivate?: () => void;
}

export type InfoGlyphCell = CustomCell<InfoGlyphCellData>;

export function infoGlyphCell(data: Omit<InfoGlyphCellData, 'kind'>): InfoGlyphCell {
  return {
    kind: GridCellKind.Custom,
    data: { kind: 'lemon-info', ...data },
    copyData: data.label,
    allowOverlay: false,
    readonly: false,
  } as InfoGlyphCell;
}

export const infoGlyphRenderer: CustomRenderer<InfoGlyphCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is InfoGlyphCell => (cell.data as { kind?: string } | undefined)?.kind === 'lemon-info',
  needsHover: true,
  needsHoverPosition: true,
  draw: (args, cell) => {
    const { ctx, rect, theme, hoverAmount } = args;
    const radius = Math.max(6, Math.min(8.5, rect.height / 2 - 5));
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    if (hoverAmount > 0) {
      ctx.save();
      ctx.globalAlpha = 0.14 * hoverAmount;
      ctx.fillStyle = theme.accentColor;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = theme.textMedium;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = theme.textMedium;
    ctx.font = `600 ${Math.round(radius * 1.45)}px ${theme.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('i', cx, cy + 0.5);
    ctx.restore();
    args.overrideCursor?.('pointer');
    void cell;
  },
  onClick: ({ cell, preventDefault }) => {
    cell.data.onActivate?.();
    preventDefault();
    return undefined;
  },
};


// ---- app glyph: a disclosure chevron --------------------------------------
// Category/account bands collapse their children in place (roadmap 340). A
// canvas-native chevron points RIGHT when collapsed and DOWN when expanded —
// the kit's glyph cells have no expanded state, so this is the ONE shared app
// glyph for a disclosure toggle (never DOM inside a cell).

export interface DisclosureCellData {
  kind: 'lemon-disclosure';
  expanded: boolean;
  label: string;
  onActivate?: () => void;
}

export type DisclosureCell = CustomCell<DisclosureCellData>;

export function disclosureGlyphCell(data: Omit<DisclosureCellData, 'kind'>): DisclosureCell {
  return {
    kind: GridCellKind.Custom,
    data: { kind: 'lemon-disclosure', ...data },
    copyData: '',
    allowOverlay: false,
    readonly: true,
  } as DisclosureCell;
}

export const disclosureGlyphRenderer: CustomRenderer<DisclosureCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is DisclosureCell => (cell.data as { kind?: string } | undefined)?.kind === 'lemon-disclosure',
  needsHover: true,
  draw: (args, cell) => {
    const { ctx, rect, theme, hoverAmount } = args;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    if (hoverAmount > 0) {
      ctx.save();
      ctx.globalAlpha = 0.12 * hoverAmount;
      ctx.fillStyle = theme.accentColor;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(8, rect.height / 2 - 3), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const size = Math.max(7, Math.min(11, rect.height - 12));
    ctx.save();
    ctx.translate(cx, cy);
    if (cell.data.expanded) ctx.rotate(Math.PI / 2);
    ctx.strokeStyle = theme.textMedium;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-size * 0.22, -size * 0.5);
    ctx.lineTo(size * 0.28, 0);
    ctx.lineTo(-size * 0.22, size * 0.5);
    ctx.stroke();
    ctx.restore();
    args.overrideCursor?.('pointer');
  },
  onClick: ({ cell, preventDefault }) => {
    cell.data.onActivate?.();
    preventDefault();
    return undefined;
  },
};


// ---- app glyph: a live colour swatch --------------------------------------
// Library colour cells render the ACTUAL hex as a swatch; clicking it opens
// the entity's editor (where the shared ColorField does the picking). A bare
// hex text cell looked like an editable string, not a colour.

export interface ColorSwatchCellData {
  kind: 'lemon-color';
  color: string;
  label: string;
  onActivate?: () => void;
}

export type ColorSwatchCell = CustomCell<ColorSwatchCellData>;

export function colorSwatchCell(data: Omit<ColorSwatchCellData, 'kind'>): ColorSwatchCell {
  return {
    kind: GridCellKind.Custom,
    data: { kind: 'lemon-color', ...data },
    copyData: data.color,
    allowOverlay: false,
    readonly: false,
  } as ColorSwatchCell;
}

export const colorSwatchRenderer: CustomRenderer<ColorSwatchCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is ColorSwatchCell => (cell.data as { kind?: string } | undefined)?.kind === 'lemon-color',
  needsHover: true,
  needsHoverPosition: true,
  draw: (args, cell) => {
    const { ctx, rect, theme, hoverAmount, hoverX } = args;
    const h = Math.max(12, Math.min(18, rect.height - 10));
    const w = Math.max(24, Math.min(54, rect.width - 18));
    const x = rect.x + 8;
    const y = rect.y + (rect.height - h) / 2;
    const overBox = hoverX !== undefined && hoverX >= 8 && hoverX <= 8 + w;
    if (overBox && hoverAmount > 0) {
      ctx.save();
      ctx.globalAlpha = 0.1 * hoverAmount;
      ctx.fillStyle = theme.accentColor;
      ctx.fillRect(x - 3, y - 2, w + 6, h + 4);
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    const r = 3;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = cell.data.color || theme.bgCell;
    ctx.fill();
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Hex value beside the box — still canvas, never a DOM cell.
    ctx.fillStyle = theme.textMedium;
    ctx.font = `500 ${Math.min(11, Math.round(rect.height * 0.42))}px ${theme.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.data.color || '—', x + w + 7, y + h / 2);
    ctx.restore();
    if (overBox) args.overrideCursor?.('pointer');
  },
  // ONLY the colour box is the colour-editor hotspot. Clicking the rest of the
  // cell selects it normally (copy/paste/right-click stay available).
  onClick: ({ cell, posX, bounds, preventDefault }) => {
    const w = Math.max(24, Math.min(54, bounds.width - 18));
    if (posX >= 8 && posX <= 8 + w) {
      cell.data.onActivate?.();
      preventDefault();
    }
    return undefined;
  },
};
