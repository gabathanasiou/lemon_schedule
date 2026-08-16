import React from 'react';
import { Pencil } from 'lucide-react';
import { RibbonRow, RibbonCell } from '../../types';
import { getAlign, getRibbonCellBaseStyle, FIELD_MAP } from '../../lib/ribbonUtils';
import { RibbonCellText } from '../RibbonCellText';
import { ColumnResizeStrip } from '../columnResize';
import { IS_COARSE } from '../../lib/device';

interface RibbonDesignerGridProps {
  readOnly: boolean;
  rows: RibbonRow[];
  colWidths: number[];
  numCols: number;
  selId: string | null;
  setSelId: (id: string | null) => void;
  setContextPos: (p: { x: number; y: number } | null) => void;
  tabBarRef: React.MutableRefObject<HTMLDivElement | null>;
  gridRef: React.MutableRefObject<HTMLDivElement | null>;
  cellRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  mergeLookup: Map<string, { group: { direction: 'h' | 'v' }; isLead: boolean }>;
  cellDragRef: React.MutableRefObject<{ rowId: string; cellId: string } | null>;
  setCellDrag: (v: { rowId: string; cellId: string } | null) => void;
  setCellDropTarget: (v: string | null) => void;
  setDropHover: (v: string | null) => void;
  dropHover: string | null;
  cellDropTarget: string | null;
  startResize: (ci: number, e: React.PointerEvent) => void;
  moveCellToRow: (srcRowId: string, srcCi: number, dstRowId: string, dstCi: number) => void;
  assign: (cellId: string, key: string) => void;
  customFieldLabels: Record<string, string>;
  cellPaddingV?: number;
  cellPaddingH?: number;
  edgePadding?: number;
}

export default function RibbonDesignerGrid({
  readOnly, rows, colWidths, numCols, selId, setSelId, setContextPos,
  tabBarRef, gridRef, cellRefs, mergeLookup, cellDragRef, setCellDrag,
  setCellDropTarget, setDropHover, dropHover, cellDropTarget,
  startResize, moveCellToRow, assign, customFieldLabels,
  cellPaddingV, cellPaddingH, edgePadding,
}: RibbonDesignerGridProps) {
  return (
    <section className={`bg-zinc-900 rounded-lg border border-zinc-800 ${readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 mb-3 px-5 pt-5">
        <Pencil className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Designer</span>
      </div>

      <div className="space-y-5 pb-5">

        {/* Column resize tabs (shared dragger — src/components/columnResize.tsx) */}
        <div className={`${IS_COARSE ? 'h-10' : 'h-5'} select-none`} style={{ paddingLeft: edgePadding ?? 2, paddingRight: edgePadding ?? 2, border: '1px solid transparent', boxSizing: 'border-box' }}>
          <ColumnResizeStrip
            widths={colWidths}
            startResize={startResize}
            readOnly={readOnly}
            variant="tab"
            containerRef={tabBarRef}
            className="h-full relative"
          />
        </div>

        {/* Single CSS Grid */}
        <div ref={gridRef} className="-mt-5" onClick={() => { if (!readOnly) setSelId(null); }} style={{
          display: 'grid',
          gridTemplateColumns: colWidths.map(w => `${w}%`).join(' '),
          gridTemplateRows: `repeat(${rows.length}, auto)`,
          border: '1px solid #d4d4d8',
          background: '#ffffff',
          color: '#464646',
          fontFamily: 'Helvetica, sans-serif',
          fontSize: '8pt',
          lineHeight: 1.1,
          paddingTop: (edgePadding ?? 2),
          paddingBottom: (edgePadding ?? 2),
          paddingLeft: (edgePadding ?? 2),
          paddingRight: (edgePadding ?? 2),
        }}>
          {rows.map((row, ri) =>
            row.cells.map((c, ci) => {
              const assigned = Boolean(c.field);
              const isSel    = selId === c.id;
              const align    = getAlign(c);
              const label    = c.field === 'text' ? (c.textContent || 'Text') : FIELD_MAP[c.field]?.label || customFieldLabels[c.field] || c.field || 'Empty';
              const mergeInfo = mergeLookup.get(c.id);

              return (
                <div key={c.id}
                  data-cell-id={c.id}
                  ref={el => { if (el) cellRefs.current.set(c.id, el); else cellRefs.current.delete(c.id); }}
                   onClick={e => { if (readOnly) return; e.stopPropagation(); setSelId(c.id); }}
                   onDoubleClick={e => { if (readOnly) return; e.stopPropagation(); setSelId(c.id); setContextPos({ x: e.clientX, y: e.clientY }); }}
                   onContextMenu={e => { if (readOnly) return; e.stopPropagation(); e.preventDefault(); setSelId(c.id); setContextPos({ x: e.clientX, y: e.clientY }); }}
                  draggable={!readOnly}
                  onDragStart={e => { if (readOnly) return; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'cell'); const val = { rowId: row.id, cellId: c.id }; cellDragRef.current = val; setCellDrag(val); }}
                  onDragEnd={() => { if (readOnly) return; cellDragRef.current = null; setCellDrag(null); setCellDropTarget(null); }}
                  onDragOver={e => {
                    if (readOnly) return;
                    const d = cellDragRef.current;
                    if (d && d.cellId !== c.id) { e.preventDefault(); setCellDropTarget(c.id); e.dataTransfer.dropEffect = 'move'; }
                    else if (!d) { e.preventDefault(); setDropHover(c.id); }
                  }}
                  onDragLeave={() => { if (readOnly) return; setCellDropTarget(null); setDropHover(null); }}
                  onDrop={e => {
                    if (readOnly) return;
                    e.preventDefault();
                    const d = cellDragRef.current;
                    if (d) {
                      const src = rows.find(r2 => r2.id === d.rowId);
                      const sci = src?.cells.findIndex(cc => cc.id === d.cellId);
                      if (sci != null && sci >= 0) moveCellToRow(d.rowId, sci, row.id, ci);
                      cellDragRef.current = null; setCellDrag(null); setCellDropTarget(null);
                    } else {
                      const k = e.dataTransfer.getData('text/field');
                      if (k) assign(c.id, k);
                      setDropHover(null);
                    }
                  }}
                  style={{
                    position: 'relative',
                    ...getRibbonCellBaseStyle(c, cellPaddingV, cellPaddingH),
                    gridColumn: ci + 1,
                    gridRow: ri + 1,
                    padding: `${cellPaddingV ?? 6}px ${cellPaddingH ?? 6}px`,
                    borderTop: '1px solid #d4d4d8',
                    borderRight: '1px solid #d4d4d8',
                    borderBottom: '1px solid #d4d4d8',
                    borderLeft: cellDropTarget === c.id ? '3px solid #3b82f6' : '1px solid #d4d4d8',
                    outline: isSel ? '2px solid #3b82f6' : dropHover === c.id && !cellDragRef.current ? '2px dashed #3b82f6' : 'none',
                    outlineOffset: -1,
                    background: cellDropTarget === c.id ? 'rgba(59,130,246,0.15)' : dropHover === c.id && !cellDragRef.current ? 'rgba(59,130,246,0.1)' : isSel ? 'rgba(59,130,246,0.08)' : mergeInfo ? (mergeInfo.group.direction === 'h' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)') : assigned ? '#ffffff' : '#fafafa',
                    minHeight: 16,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}>
                  <div style={{
                    display: 'flex', flex: 1, minWidth: 0,
                    fontWeight: c.field === 'sceneNumber' ? 700 : 500,
                    textTransform: c.field === 'set' ? 'uppercase' : 'none',
                    color: assigned ? undefined : '#a1a1aa',
                    fontStyle: assigned ? undefined : 'italic',
                  }}>
                    {(align === 'center' || align === 'right') && <span style={{ flex: '1 1 0' }} />}
                    <RibbonCellText cell={c} span={1} style={{ flexShrink: 1, minWidth: 0 }}>
                      {(c.prefix ? '*' : '') + (assigned ? label : 'Empty') + (c.suffix ? '*' : '')}
                    </RibbonCellText>
                    {(align === 'left' || align === 'center') && ci < numCols - 1 && <span style={{ flex: '1 1 0' }} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </section>
  );
}
