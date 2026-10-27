import React from 'react';
import { DragOverlay } from '@dnd-kit/core';
import { SortableRibbon } from '../SortableRibbon';
import { FloatingTooltip } from '../FloatingTooltip';
import { RemoteDragGhostLayer } from '../RemoteDragGhosts';
import { ScheduleRow, Scene, RibbonRow, SceneColorPalette, CustomCategoryDef, ProjectElement } from '../../types';
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
  /** The active version's rows — resolving a PEER's claimed row ids to rows
   *  for the remote ghost (roadmap 235). */
  rows: ScheduleRow[];
  scenes: Scene[];
  ribbon: RibbonRow[];
  colWidths: number[];
  cellPaddingV: number;
  cellPaddingH: number;
  textSize?: number;
  edgePadding: number;
  cellBorders: 'none' | 'vertical' | 'horizontal' | 'both';
  digitBuffer: string;
  bufferMs: number;
  selectionSummary: SelectionSummary | null;
  bufferSummary: BufferSummary | null;
  dispatch: (a: any) => void;
  activeVersionId?: string;
  palette?: SceneColorPalette;
  castMembers?: ProjectElement[];
  breakdownElements?: Record<string, ProjectElement[]>;
  customCategories?: CustomCategoryDef[];
  hiddenCategories?: string[];
}

/** The stacked drag visual (up to 3 rows + a ×N badge) — ONE renderer for the
 *  local dnd-kit overlay and the remote (roadmap 235) peer ghost, so the two
 *  can never drift. `overlay` registers with dnd-kit exactly as the local
 *  ghost always did; `remote` renders the static row (no sortable, no
 *  listeners — the ghost must never interfere with the local drops). */
function GhostRows({
  mode, rows, scenes, ribbon, colWidths, cellPaddingV, cellPaddingH, textSize, edgePadding, cellBorders,
  dispatch, activeVersionId, palette, castMembers, breakdownElements, customCategories, hiddenCategories,
}: Pick<ScheduleOverlaysProps, 'scenes' | 'ribbon' | 'colWidths' | 'cellPaddingV' | 'cellPaddingH' | 'textSize' | 'edgePadding' | 'cellBorders' | 'dispatch' | 'activeVersionId' | 'palette' | 'castMembers' | 'breakdownElements' | 'customCategories' | 'hiddenCategories'> & {
  mode: 'overlay' | 'remote';
  rows: ScheduleRow[];
}) {
  if (rows.length === 0) return null;
  const stack = rows.length > 1 ? rows.slice(0, 3).reverse() : rows;
  return (
    <div className="pointer-events-none relative" style={{ width: GHOST_WIDTH }}>
      {stack.map((row, i) => {
        const isTop = i === stack.length - 1;
        const offset = (stack.length - 1 - i) * 4;
        const opacity = isTop ? 1 : 1 - (stack.length - 1 - i) * 0.2;
        return (
          <div key={row.id} style={{ position: isTop ? 'relative' : 'absolute', top: offset, left: 0, right: 0, opacity, zIndex: isTop ? 10 : 5 - i }}>
            <SortableRibbon
              row={row as any}
              scenes={scenes}
              scene={row.type === 'SCENE' ? (scenes.find(s => s.id === row.sceneId) ?? null) : null}
              ribbon={ribbon}
              colWidths={colWidths}
              cellPaddingV={cellPaddingV}
              cellPaddingH={cellPaddingH}
              textSize={textSize}
              edgePadding={edgePadding}
              cellBorders={cellBorders}
              dispatch={dispatch}
              activeVersionId={activeVersionId}
              palette={palette}
              castMembers={castMembers}
              breakdownElements={breakdownElements}
              customCategories={customCategories}
              hiddenCategories={hiddenCategories}
              {...(mode === 'overlay' ? { isOverlay: true } : { ghost: true })}
            />
          </div>
        );
      })}
      {rows.length > 1 && (
        <div className="absolute -top-3 -right-3 bg-blue-500 text-white font-bold px-3 py-1 rounded-full shadow-lg text-sm border-2 border-white z-20">
          ×{rows.length}
        </div>
      )}
    </div>
  );
}

export default function ScheduleOverlays({
  activeId, activeDragRow, activeDragIds, activeDragRows, rows, scenes,
  ribbon, colWidths, cellPaddingV, cellPaddingH, textSize, edgePadding, cellBorders,
  digitBuffer, bufferMs, selectionSummary, bufferSummary,
  dispatch, activeVersionId, palette, castMembers, breakdownElements, customCategories, hiddenCategories,
}: ScheduleOverlaysProps) {
  const shared = {
    scenes, ribbon, colWidths, cellPaddingV, cellPaddingH, textSize, edgePadding, cellBorders,
    dispatch, activeVersionId, palette, castMembers, breakdownElements, customCategories, hiddenCategories,
  };
  return (
    <>
      <DragOverlay dropAnimation={null}>
        {activeDragRow ? (
          <GhostRows mode="overlay" rows={activeDragIds.size > 1 ? activeDragRows : [activeDragRow]} {...shared} />
        ) : null}
      </DragOverlay>

      {/* A peer's live drag (roadmap 235): the same stacked visual, at their
          cursor, ~half size so their wide rows don't cover the board. */}
      <RemoteDragGhostLayer
        surface="schedule"
        scale={0.5}
        renderContent={(drag) => (
          <GhostRows
            mode="remote"
            rows={drag.itemIds.map(id => rows.find(r => r.id === id)).filter((r): r is ScheduleRow => !!r)}
            {...shared}
          />
        )}
      />

      {digitBuffer && (
        <div className="fixed inset-0 pointer-events-none z-[9999] flex items-start justify-center pt-12">
          <div className="bg-[var(--ui-panel-bg)]/90 backdrop-blur-md border border-[color:var(--ui-card-border)] rounded-xl shadow-2xl px-6 py-3 flex flex-col items-center gap-1.5 min-w-[140px]">
            <span className="text-[color:var(--ui-text)] text-xs font-semibold uppercase tracking-widest">Schedule to Section</span>
            <span className="text-[color:var(--ui-text-strong)] text-3xl font-bold tabular-nums">{digitBuffer}</span>
            <div className="w-full h-1 bg-[var(--ui-item-active-bg)] rounded-full overflow-hidden">
              <div key={digitBuffer} className="h-full bg-blue-500 rounded-full" style={{ animation: `shrink ${bufferMs}ms linear forwards` }} />
            </div>
          </div>
        </div>
      )}

      <FloatingTooltip open={!!selectionSummary || !!bufferSummary}>
        <div className="bg-[var(--ui-panel-bg)] text-[color:var(--ui-text-strong)] text-[10px] rounded shadow-xl whitespace-nowrap leading-relaxed">
          {selectionSummary && (
            <>
              <div className="px-2.5 py-1.5">{selectionSummary.count} strip{selectionSummary.count > 1 ? 's' : ''} selected</div>
              <div className="border-t border-[color:var(--ui-card-border)] px-2.5 py-1.5">{formatDuration(selectionSummary.totalMinutes)}</div>
            </>
          )}
          {selectionSummary && bufferSummary && <div className="border-t border-[color:var(--ui-card-border)]" />}
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
