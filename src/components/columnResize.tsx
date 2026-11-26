import React, { useCallback, useRef } from 'react';
import { MIN_PCT } from '../lib/ribbonDefaults';
import { useCurrentDocument } from '../lib/popoutTarget';
import { IS_COARSE } from '../lib/device';
import { createResizeBadge, createResizeBadgeGroup } from '../lib/resizeBadge';
import { resizeAdjacentWidths, scaleRightWidths } from '../lib/columnWidthResize';

/**
 * Shared column-resize dragger (the ribbon designer's resize behavior is the
 * single standard — see docs/ROADMAP.md item 24). Consumed by the ribbon
 * designer's resize tabs (RibbonDesignerGrid), the reports table's
 * TableResizeBar and the columns-block gutter resize. Replaces three
 * hand-rolled pointer sessions with one that has the full gold-standard set:
 * pointer capture, `touch-action: none` locking, document-level move/up,
 * MIN_PCT clamps and Shift = scale all right columns.
 */

export interface ColumnResizeHandlers {
  /** Live DOM/CSS application during the drag (ribbon: gridTemplateColumns on
   *  grid/tab bar/previews; table: inline cell widths + strip template).
   *  `ci` is the boundary's left/top cell. */
  apply: (sizes: number[], ev: PointerEvent, ci: number) => void;
  /** Store commit on release with the final sizes (columns: sum preserved ≈ 100). */
  commit: (sizes: number[], ci: number) => void;
  /** Base width in px for the delta→percent conversion; measured once at drag
   *  start. Defaults to the pointer target's clientWidth. */
  getWidth?: () => number;
  /** Elements that get `touch-action: none` for the drag duration (grid,
   *  canvas…). `document.body` is always locked too. */
  touchActionTargets?: (HTMLElement | null)[];
  /** Minimum column width in percent (default MIN_PCT = 2.5). */
  minPct?: number;
  /** `'x'` (default) = horizontal boundaries between columns (percent widths);
   *  `'y'` = vertical boundaries between rows (px heights). */
  axis?: 'x' | 'y';
  /** `'x'` only: adjacent cells share a fixed total (default true). */
  redistribute?: boolean;
  /** `'y'` only: minimum row height in px (default 14). */
  minSize?: number;
  /** Sizes at drag start (defaults to the `widths` argument) — rows measure
   *  their real rendered heights here. */
  getSizes?: () => number[];
  /** Viewport boxes of the RENDERED columns, indexed like `widths` — enables
   *  the per-column percentage badges above each resized column (roadmap 367).
   *  Omit to fall back to the single pointer pill. */
  columnRects?: () => { left: number; top: number; width: number }[];
}

/**
 * Starts a resize session for the boundary between cells `ci` and `ci + 1`
 * (columns) or below cell `ci` (rows). Returns a stable `(ci, e) => void`
 * pointerdown handler.
 */
export function useColumnResize(
  widths: number[],
  handlers: ColumnResizeHandlers,
): (ci: number, e: React.PointerEvent) => void {
  const doc = useCurrentDocument();
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  return useCallback((ci: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const h = handlersRef.current;
    const axis = h.axis ?? 'x';
    const redistribute = h.redistribute ?? true;
    const d = doc || window.document;
    const target = e.target as HTMLElement | null;
    target?.setPointerCapture?.(e.pointerId);
    const minPct = h.minPct ?? MIN_PCT;
    const initial = h.getSizes ? h.getSizes() : [...widthsRef.current];
    if (redistribute && ci >= initial.length - 1) return;
    let current = [...initial];
    const baseWidth = h.getWidth
      ? h.getWidth()
      : target?.clientWidth || 1;
    const targets = (h.touchActionTargets || []).filter((t): t is HTMLElement => !!t);
    const lock = () => {
      document.body.style.touchAction = 'none';
      for (const t of targets) t.style.touchAction = 'none';
    };
    const unlock = () => {
      document.body.style.touchAction = '';
      for (const t of targets) t.style.touchAction = '';
    };
    lock();
    const startPos = axis === 'y' ? e.clientY : e.clientX;
    // Roadmap 367 — ONE live pill for every resize gesture. Columns with a
    // rect provider get a pill ABOVE each affected column instead of one at
    // the pointer; rows keep the pointer pill.
    const badge = createResizeBadge(d);
    const columnBadges = axis === 'x' ? createResizeBadgeGroup(d) : null;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const pos = axis === 'y' ? ev.clientY : ev.clientX;
      const delta = pos - startPos;
      if (axis === 'y') {
        const min = h.minSize ?? 14;
        current = [...initial];
        current[ci] = Math.max(min, Math.round(initial[ci] + delta));
        badge.update(`${current[ci]} px`, ev.clientX, ev.clientY);
      } else {
        const deltaPct = (delta / baseWidth) * 100;
        current = ev.shiftKey
          ? scaleRightWidths(initial, ci, deltaPct, minPct)
          : resizeAdjacentWidths(initial, ci, deltaPct, minPct);
        const rects = h.columnRects?.() ?? [];
        const affected = ev.shiftKey
          ? current.map((_, i) => i).slice(ci)
          : [ci, ci + 1];
        // Shift floors the tail at minPct; a plain pair drag floors at the
        // pair's own safe split when it is already below 2× minPct.
        const pairFloor = ev.shiftKey
          ? minPct
          : Math.min(minPct, ((initial[ci] ?? 0) + (initial[ci + 1] ?? 0)) / 2);
        const items = rects.length > 0
          ? affected.flatMap(i => {
            const rect = rects[i];
            if (!rect) return [];
            const pct = current[i] ?? 0;
            const floor = i === ci ? pairFloor : minPct;
            const atFloor = pct <= floor + 0.001;
            return [{
              text: atFloor ? `min ${Math.round(floor * 10) / 10}%` : `${pct.toFixed(1)}%`,
              centerX: rect.left + rect.width / 2,
              bottom: rect.top - 2,
              tone: atFloor ? ('warning' as const) : ('default' as const),
            }];
          })
          : [];
        if (items.length > 0) {
          columnBadges?.update(items);
          badge.remove();
        } else {
          columnBadges?.remove();
          const pct = current[ci] ?? 0;
          const px = Math.round((pct / 100) * baseWidth);
          const atFloor = pct <= pairFloor + 0.001;
          badge.update(
            atFloor ? `min ${Math.round(pairFloor * 10) / 10}% · ${px} px` : `${pct.toFixed(1)}% · ${px} px`,
            ev.clientX,
            ev.clientY,
            atFloor ? 'warning' : 'default',
          );
        }
      }
      h.apply(current, ev, ci);
    };

    const onUp = () => {
      d.removeEventListener('pointermove', onMove);
      d.removeEventListener('pointerup', onUp);
      d.removeEventListener('pointercancel', onUp);
      unlock();
      badge.remove();
      columnBadges?.remove();
      h.commit(current, ci);
    };

    d.addEventListener('pointermove', onMove);
    d.addEventListener('pointerup', onUp);
    d.addEventListener('pointercancel', onUp);
  }, [doc]);
}

/**
 * Even-split reset for one horizontal boundary (roadmap 194 — double-click a
 * resize tab): the two neighbouring sizes split their combined value evenly,
 * every other size is untouched. Returns null when the index is out of range
 * or the pair can't hold the floor — ONE implementation shared by the free
 * tables, the collection-table bar and the ribbon designer.
 */
export function splitBoundaryEven(sizes: number[], ci: number, min: number = MIN_PCT): number[] | null {
  if (ci < 0 || ci + 1 >= sizes.length) return null;
  const half = Math.round(((sizes[ci] + sizes[ci + 1]) / 2) * 100) / 100;
  if (half < min) return null;
  return sizes.map((w, i) => (i === ci || i === ci + 1 ? half : w));
}

/**
 * Handle strip for column resize: one cell per column (grid template mirrors
 * the columns), a handle at each cell's right edge. Live tracking during a
 * drag works because consumers write the updated `gridTemplateColumns` to the
 * strip's container (via `containerRef`) — the same mechanism the ribbon
 * grid uses. Renders the ribbon designer's triangle tabs (the single
 * standard, roadmap item 34).
 */
export function ColumnResizeStrip({
  widths,
  startResize,
  readOnly,
  containerRef,
  className,
  style,
  activeIndex,
  onHoverIndex,
  onResetBoundary,
}: {
  widths: number[];
  startResize: (ci: number, e: React.PointerEvent) => void;
  readOnly?: boolean;
  containerRef?: React.Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;
  /** Boundary index painted as active (hover/drag sync with the matching cell
   *  border highlight). */
  activeIndex?: number | null;
  /** Handle hover reporting (boundary index, or null on leave). */
  onHoverIndex?: (i: number | null) => void;
  /** Double-click on a tab resets that boundary (roadmap 194). */
  onResetBoundary?: (ci: number) => void;
}) {
  return (
    <div
      ref={containerRef}
      className={`relative h-full select-none ${className ?? ''}`}
      style={{ display: 'grid', gridTemplateColumns: widths.map(w => `${w}%`).join(' '), ...style }}
    >
      {widths.map((_w, i) => {
        const active = activeIndex === i;
        return (
          <div key={i} className="relative h-full">
            {i < widths.length - 1 && (
              <div
                className={`absolute bottom-0 cursor-col-resize group/tab z-10 flex flex-col items-center justify-end${IS_COARSE ? ' transition-transform group-active/tab:-translate-y-2.5 touch-none px-2.5' : ''} ${readOnly ? 'pointer-events-none opacity-30' : 'pointer-events-auto'}`}
                style={{ left: '100%', transform: 'translateX(-50%)' }}
                onPointerDown={e => !readOnly && startResize(i, e)}
                onDoubleClick={e => { e.stopPropagation(); if (!readOnly) onResetBoundary?.(i); }}
                onClick={e => e.stopPropagation()}
                onMouseEnter={onHoverIndex ? () => onHoverIndex(i) : undefined}
                onMouseLeave={onHoverIndex ? () => onHoverIndex(null) : undefined}
                title={onResetBoundary ? `Resize column ${i + 1}/${i + 2} (double-click to even)` : `Resize column ${i + 1}/${i + 2}`}
              >
                <div className={`${IS_COARSE ? 'border-l-[8px] border-r-[8px] border-t-[10px] group-active/tab:border-l-[10px] group-active/tab:border-r-[10px] group-active/tab:border-t-[14px] group-active/tab:border-t-blue-500 transition-all' : 'border-l-[5px] border-r-[5px] border-t-[6px] transition-colors'} border-l-transparent border-r-transparent ${active ? 'border-t-blue-400' : 'border-t-zinc-500/40 group-hover/tab:border-t-blue-400'}`} />
                <div className={`${IS_COARSE ? 'w-px h-5 group-active/tab:h-8 group-active/tab:bg-blue-500 transition-all' : 'w-px h-3.5 transition-colors'} mx-auto ${active ? 'bg-blue-400' : 'bg-zinc-500/40 group-hover/tab:bg-blue-400'}`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ColumnResizeStrip;
