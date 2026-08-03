import React from 'react';
import { DragOverlay } from '@dnd-kit/core';
import { SortableRibbon } from '../SortableRibbon';
import { FloatingTooltip } from '../FloatingTooltip';
import { ScheduleRow, Scene, RibbonDesign } from '../../types';
import { formatDuration } from '../../lib/utils';
import { VIEW_WIDTHS } from '../../lib/persist';

const GHOST_WIDTH = VIEW_WIDTHS.portrait ?? 730;

interface SelectionSummary {
  count: number;
  totalMinutes: number;
}

interface BufferSummary {
  count: number;
}

interface ScheduleOverlaysProps {
  activeId: string | null;
  activeDragRow: ScheduleRow | null;
  activeDragIds: Set<string>;
  activeDragRows: ScheduleRow[];
  scenes: Scene[];
  textEditingEnabled: boolean;
  ribbon: RibbonDesign;
  colWidths: number[];
  cellPaddingV: number;
  cellPaddingH: number;
  edgePadding: number;
  cellBorders: 'none' | 'vertical' | 'horizontal' | 'both';
  digitBuffer: string;
  bufferMs: number;
  selectionSummary: SelectionSummary | null;
  bufferSummary: BufferSummary | null;
}

export default function ScheduleOverlays({
  activeId, activeDragRow, activeDragIds, activeDragRows, scenes, textEditingEnabled,
  ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders,
  digitBuffer, bufferMs, selectionSummary, bufferSummary,
}: ScheduleOverlaysProps) {
  return (
    <>
      <DragOverlay dropAnimation={null}>
        {activeDragRow ? (
          <div className="pointer-events-none relative" style={{ width: GHOST_WIDTH }}>
            {activeDragIds.size > 1 && Array.from(activeDragIds).slice(0, 3).reverse().map((id, i, arr) => {
              const row = activeDragRows.find(r => r.id === id);
              if (!row) return null;
              const isTop = i === arr.length - 1;
              const offset = (arr.length - 1 - i) * 4;
              const opacity = isTop ? 1 : 1 - (arr.length - 1 - i) * 0.2;
              return (
                <div key={id} style={{ position: isTop ? 'relative' : 'absolute', top: offset, left: 0, right: 0, opacity, zIndex: isTop ? 10 : 5 - i }}>
                  <SortableRibbon row={row as any} scenes={scenes} isOverlay textEditingEnabled={textEditingEnabled} ribbon={ribbon} colWidths={colWidths} cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH} edgePadding={edgePadding} cellBorders={cellBorders} />
                </div>
              );
            })}
            {activeDragIds.size === 1 && activeDragIds.has(activeId as string) && (
              <SortableRibbon row={activeDragRow as any} scenes={scenes} isOverlay textEditingEnabled={textEditingEnabled} ribbon={ribbon} colWidths={colWidths} cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH} edgePadding={edgePadding} />
            )}
            {activeDragIds.size > 1 && (
               <div className="absolute -top-3 -right-3 bg-blue-500 text-white font-bold px-3 py-1 rounded-full shadow-lg text-sm border-2 border-white z-20">
                 ×{activeDragIds.size}
               </div>
            )}
          </div>
        ) : null}
      </DragOverlay>

      {digitBuffer && (
        <div className="fixed inset-0 pointer-events-none z-[9999] flex items-start justify-center pt-12">
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-700 rounded-xl shadow-2xl px-6 py-3 flex flex-col items-center gap-1.5 min-w-[140px]">
            <span className="text-zinc-300 text-xs font-semibold uppercase tracking-widest">Schedule to Section</span>
            <span className="text-white text-3xl font-bold tabular-nums">{digitBuffer}</span>
            <div className="w-full h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div key={digitBuffer} className="h-full bg-blue-500 rounded-full" style={{ animation: `shrink ${bufferMs}ms linear forwards` }} />
            </div>
          </div>
        </div>
      )}

      <FloatingTooltip open={!!selectionSummary || !!bufferSummary}>
        <div className="bg-zinc-900 text-white text-[10px] rounded shadow-xl whitespace-nowrap leading-relaxed">
          {selectionSummary && (
            <>
              <div className="px-2.5 py-1.5">{selectionSummary.count} strip{selectionSummary.count > 1 ? 's' : ''} selected</div>
              <div className="border-t border-zinc-700 px-2.5 py-1.5">{formatDuration(selectionSummary.totalMinutes)}</div>
            </>
          )}
          {selectionSummary && bufferSummary && <div className="border-t border-zinc-700" />}
          {bufferSummary && (
            <div className="px-2.5 py-1.5">{bufferSummary.count} strip{bufferSummary.count > 1 ? 's' : ''} in buffer</div>
          )}
        </div>
      </FloatingTooltip>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </>
  );
}
