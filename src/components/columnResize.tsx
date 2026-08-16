import React, { useCallback, useRef } from 'react';
import { MIN_PCT } from '../lib/ribbonDefaults';
import { useCurrentDocument } from '../lib/popoutTarget';
import { IS_COARSE } from '../lib/device';

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
   *  grid/tab bar/previews; table: inline cell widths + strip template). */
  apply: (widths: number[], ev: PointerEvent) => void;
  /** Store commit on release with the final widths (sum preserved ≈ 100). */
  commit: (widths: number[]) => void;
  /** Base width in px for the delta→percent conversion; measured once at drag
   *  start. Defaults to the pointer target's clientWidth. */
  getWidth?: () => number;
  /** Elements that get `touch-action: none` for the drag duration (grid,
   *  canvas…). `document.body` is always locked too. */
  touchActionTargets?: (HTMLElement | null)[];
  /** Minimum column width in percent (default MIN_PCT = 2.5). */
  minPct?: number;
}

/**
 * Starts a column-boundary resize session for the boundary between columns
 * `ci` and `ci + 1`. Returns a stable `(ci, e) => void` pointerdown handler.
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
    const d = doc || window.document;
    const target = e.target as HTMLElement | null;
    target?.setPointerCapture?.(e.pointerId);
    const minPct = handlersRef.current.minPct ?? MIN_PCT;
    const initial = [...widthsRef.current];
    if (ci >= initial.length - 1) return;
    let current = [...initial];
    const baseWidth = handlersRef.current.getWidth
      ? handlersRef.current.getWidth()
      : target?.clientWidth || 1;
    const targets = (handlersRef.current.touchActionTargets || []).filter((t): t is HTMLElement => !!t);
    const lock = () => {
      document.body.style.touchAction = 'none';
      for (const t of targets) t.style.touchAction = 'none';
    };
    const unlock = () => {
      document.body.style.touchAction = '';
      for (const t of targets) t.style.touchAction = '';
    };
    lock();

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const deltaPct = ((ev.clientX - e.clientX) / baseWidth) * 100;
      const cw = [...initial];
      const curA = cw[ci];
      const curB = cw[ci + 1];
      const totalAB = curA + curB;
      if (ev.shiftKey) {
        // Shift = scale all columns right of the boundary proportionally.
        const rightSum = cw.slice(ci + 1).reduce((s, w) => s + w, 0);
        const nRight = cw.length - ci - 1;
        const newA = Math.max(minPct, Math.min(curA + rightSum - minPct * nRight, curA + deltaPct));
        const remaining = rightSum + curA - newA;
        const scale = remaining / rightSum;
        cw[ci] = Math.round(newA * 100) / 100;
        for (let i = ci + 1; i < cw.length; i++) {
          cw[i] = Math.max(minPct, Math.round(cw[i] * scale * 100) / 100);
        }
      } else {
        const newA = Math.max(minPct, Math.min(totalAB - minPct, curA + deltaPct));
        const newB = totalAB - newA;
        cw[ci] = Math.round(newA * 100) / 100;
        cw[ci + 1] = Math.round(newB * 100) / 100;
      }
      current = cw;
      handlersRef.current.apply(cw, ev);
    };

    const onUp = () => {
      d.removeEventListener('pointermove', onMove);
      d.removeEventListener('pointerup', onUp);
      unlock();
      handlersRef.current.commit(current);
    };

    d.addEventListener('pointermove', onMove);
    d.addEventListener('pointerup', onUp);
  }, [doc]);
}

/**
 * Handle strip for column resize: one cell per column (grid template mirrors
 * the columns), a handle at each cell's right edge. Live tracking during a
 * drag works because consumers write the updated `gridTemplateColumns` to the
 * strip's container (via `containerRef`) — the same mechanism the ribbon
 * grid uses.
 *
 * `variant="tab"` renders the ribbon designer's triangle tabs;
 * `variant="bar"` renders the reports table's slim blue bars.
 */
export function ColumnResizeStrip({
  widths,
  startResize,
  readOnly,
  variant = 'tab',
  containerRef,
  className,
  style,
}: {
  widths: number[];
  startResize: (ci: number, e: React.PointerEvent) => void;
  readOnly?: boolean;
  variant?: 'tab' | 'bar';
  containerRef?: React.Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      ref={containerRef}
      className={`relative h-full select-none ${className ?? ''}`}
      style={{ display: 'grid', gridTemplateColumns: widths.map(w => `${w}%`).join(' '), ...style }}
    >
      {widths.map((_w, i) => (
        <div key={i} className="relative h-full">
          {i < widths.length - 1 && (
            variant === 'tab' ? (
              <div
                className={`absolute bottom-0 cursor-col-resize group/tab z-10 flex flex-col items-center justify-end${IS_COARSE ? ' transition-transform group-active/tab:-translate-y-2.5 touch-none px-2.5' : ''} ${readOnly ? 'pointer-events-none opacity-30' : ''}`}
                style={{ left: '100%', transform: 'translateX(-50%)' }}
                onPointerDown={e => !readOnly && startResize(i, e)}
                onClick={e => e.stopPropagation()}
              >
                <div className={`${IS_COARSE ? 'border-l-[8px] border-r-[8px] border-t-[10px] group-active/tab:border-l-[10px] group-active/tab:border-r-[10px] group-active/tab:border-t-[14px] group-active/tab:border-t-blue-500 transition-all' : 'border-l-[5px] border-r-[5px] border-t-[6px] transition-colors'} border-l-transparent border-r-transparent border-t-zinc-500/40 group-hover/tab:border-t-blue-400`} />
                <div className={`${IS_COARSE ? 'w-px h-5 group-active/tab:h-8 group-active/tab:bg-blue-500 transition-all' : 'w-px h-3.5 transition-colors'} mx-auto bg-zinc-500/40 group-hover/tab:bg-blue-400`} />
              </div>
            ) : (
              <div
                className="pointer-events-auto absolute top-0 bottom-0 cursor-col-resize touch-none"
                style={{ left: 'calc(100% - 3px)', width: 6, background: 'rgba(59,130,246,0.6)', borderRadius: 3 }}
                onPointerDown={e => !readOnly && startResize(i, e)}
                onClick={e => e.stopPropagation()}
                title={`Resize column ${i + 1}/${i + 2}`}
              />
            )
          )}
        </div>
      ))}
    </div>
  );
}

export default ColumnResizeStrip;
