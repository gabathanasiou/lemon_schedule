import React from 'react';

/** Shared column drag-reorder session for report tables. Collection tables
 *  start it from any header/body cell (a plain click selects); free tables
 *  start it from the header's ⠿ grip (cells are editors, so only the
 *  grip can host the pointer). A drag past a 6px threshold reorders; the drop
 *  target is computed from the pointer row's cell x-centers, and `colOutline`
 *  paints the dimmed source + dashed target column on every cell. */
export function useTableColumnReorder(opts: {
  enabled: boolean;
  selected?: number | null;
  onSelect?: (ci: number) => void;
  onMove?: (from: number, to: number) => void;
}) {
  const { enabled, selected, onSelect, onMove } = opts;
  const dragRef = React.useRef<{ from: number; startX: number; startY: number; dragging: boolean } | null>(null);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const overRef = React.useRef<number | null>(null);
  overRef.current = dragOver;

  const startDrag = (e: React.PointerEvent, ci: number) => {
    if (!enabled) return;
    // preventDefault stops the block card's native HTML5 drag from swallowing
    // pointer events; selection happens on pointerup instead of click.
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { from: ci, startX: e.clientX, startY: e.clientY, dragging: false };
    const rowEl = (e.currentTarget as HTMLElement).closest('.rm-header, .rm-row') as HTMLElement | null;
    const onPointerMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !rowEl) return;
      if (!d.dragging && Math.abs(ev.clientX - d.startX) + Math.abs(ev.clientY - d.startY) < 6) return;
      if (!d.dragging) {
        d.dragging = true;
        setDragFrom(d.from);
      }
      ev.preventDefault();
      const rect = rowEl.getBoundingClientRect();
      const cells = Array.from(rowEl.children) as HTMLElement[];
      const x = ev.clientX - rect.left;
      let acc = 0;
      const centers = cells.map(c => { const w = c.getBoundingClientRect().width; acc += w; return acc - w / 2; });
      let over = cells.length - 1;
      for (let i = 0; i < centers.length; i++) {
        if (x <= centers[i] + 0.5) { over = i; break; }
      }
      overRef.current = over;
      setDragOver(over);
    };
    const onPointerUp = () => {
      const d = dragRef.current;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (!d) return;
      if (d.dragging) {
        if (overRef.current !== null && overRef.current !== d.from) onMove?.(d.from, overRef.current);
      } else {
        onSelect?.(d.from);
      }
      dragRef.current = null;
      setDragFrom(null);
      setDragOver(null);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const colOutline = (ci: number): React.CSSProperties => {
    if (selected === ci) return { outline: '2px solid #3b82f6', outlineOffset: -2 };
    if (dragFrom !== null && dragOver !== null && dragFrom !== dragOver && dragOver === ci) return { outline: '2px dashed #3b82f6', outlineOffset: -2 };
    if (dragFrom === ci) return { opacity: 0.45 };
    return {};
  };

  return { dragFrom, dragOver, startDrag, colOutline };
}
