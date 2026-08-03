import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useProject } from '../../store';
import { ScheduleRow, Scene, RuleViolation, SceneColorPalette } from '../../types';
import { getDayHeaderColors } from '../../lib/ribbonUtils';
import { ViolationTooltip } from '../ViolationTooltip';
import { Flag } from 'lucide-react';
import { SceneCard, SceneCardContent } from './SceneCard';
import { DayDropState, formatFullDate } from './calendarUtils';

export const DayCell: React.FC<{
  dateKey: string; date: Date; isToday: boolean;
  rows: ScheduleRow[]; scenes: Scene[]; displayField: string;
  violations: RuleViolation[];
  sceneViolationMap: Map<string, RuleViolation[]>;
  onToggle: (dateKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, dateKey: string) => void;
  nonShootStatus?: string;
  sectionIndex?: number;
  sectionLabel?: string;
  activeTool?: string | null;
  selectedIds?: Set<string>;
  activeDragIds?: Set<string>;
  onRowClick?: (id: string, e: React.MouseEvent) => void;
  insertBeforeId?: string | null;
  activeDragRow?: ScheduleRow | null;
  activeDragRows?: ScheduleRow[];
  activeRowId?: string | null;
  onRowDoubleClick?: (id: string) => void;
  onRowContextMenu?: (e: React.MouseEvent) => void;
  onBodyContextMenu?: (e: React.MouseEvent, targetRowId: string) => void;
  bodyTargetRowId?: string | null;
  palette?: SceneColorPalette;
  activeDragDay?: number | null;
  dropState?: DayDropState;
  flashColor?: 'a' | 'b';
}> = ({ dateKey, date, isToday, rows, scenes, displayField, violations, sceneViolationMap, onToggle, onContextMenu, nonShootStatus, sectionIndex, sectionLabel, activeTool, selectedIds, activeDragIds, onRowClick, insertBeforeId, activeDragRow, activeDragRows = [], activeRowId, onRowDoubleClick, onRowContextMenu, onBodyContextMenu, bodyTargetRowId, palette, activeDragDay, dropState, flashColor }) => {
  const { readOnly } = useProject();
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'DAY_CELL', date: dateKey, sectionIndex },
  });

  const { setNodeRef: setDragRef, attributes: dragAttributes, listeners: dragListeners, isDragging } = useDraggable({
    id: `day-section-${sectionIndex ?? -1}`,
    data: { type: 'DAY', sectionIndex },
    disabled: !sectionLabel || !!activeTool || readOnly,
  });

  const { setNodeRef: setEndRef } = useDroppable({
    id: `end-${dateKey}`,
    data: { type: 'STRIP_END', date: dateKey, sectionIndex },
    disabled: !!nonShootStatus,
  });

  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [scrollMask, setScrollMask] = React.useState('none');
  const checkScroll = React.useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 2;
    const atBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 2;
    if (atTop && atBottom) setScrollMask('none');
    else if (atTop) setScrollMask('linear-gradient(to top, transparent, black 12px)');
    else if (atBottom) setScrollMask('linear-gradient(to bottom, transparent, black 12px)');
    else setScrollMask('linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)');
  }, []);
  React.useEffect(() => {
    checkScroll();
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkScroll, rows.length]);

  const statusBadge = nonShootStatus === 'hold' ? 'H' : nonShootStatus === 'travel' ? 'T' : nonShootStatus === 'holiday' ? 'DO' : null;
  const statusBg = nonShootStatus === 'hold' ? 'bg-red-50' : nonShootStatus === 'travel' ? 'bg-purple-50' : nonShootStatus === 'holiday' ? 'bg-zinc-100' : '';
  const hdr = getDayHeaderColors(palette);
  const headerColor = nonShootStatus === 'hold' ? 'bg-red-600 text-white'
    : nonShootStatus === 'travel' ? 'bg-purple-600 text-white'
    : nonShootStatus === 'holiday' ? 'bg-zinc-400 text-zinc-800'
    : sectionLabel ? ''
    : 'bg-zinc-200 text-zinc-600';
  const headerStyle = sectionLabel && !nonShootStatus ? { background: hdr.background, color: hdr.color } : undefined;

  const headerLabel = nonShootStatus === 'hold' ? 'HOLD' : nonShootStatus === 'travel' ? 'TRAVEL' : nonShootStatus === 'holiday' ? 'DAY OFF' : sectionLabel || '';

  const isNonShoot = !!nonShootStatus;
  const isWorking = sectionIndex != null;

  const drop = dropState && dropState.sectionIndex === sectionIndex ? dropState : null;

  return (
    <div ref={setNodeRef} data-date-key={dateKey}
      className={`min-h-[80px] h-full border-r flex flex-col relative
        ${!isWorking && !nonShootStatus ? 'border-b border-dashed border-zinc-200' : 'border-b border-zinc-200'}
        ${!isWorking && !nonShootStatus ? 'bg-zinc-50 text-zinc-400' : statusBg || 'bg-zinc-50'}
        ${!drop && isOver && !isNonShoot ? '!bg-blue-50' : ''}`}
    >
        {drop?.zone === 'insert' && drop.side === 'before' && (
          <div className="absolute inset-y-0 left-0 w-[4px] bg-blue-500 z-30 pointer-events-none" />
        )}
        {drop?.zone === 'insert' && drop.side === 'after' && (
          <div className="absolute inset-y-0 right-0 w-[4px] bg-blue-500 z-30 pointer-events-none" />
        )}
        {drop?.zone === 'swap' && (
          <div className="absolute inset-0 z-20 pointer-events-none border-2 border-blue-600 bg-blue-500/20" />
        )}
        {flashColor && (
          <div className={`absolute inset-0 z-30 pointer-events-none ${flashColor === 'a' ? 'cal-day-flash' : 'cal-day-flash-b'}`} />
        )}
        <div
          ref={setDragRef}
          {...dragListeners}
          {...dragAttributes}
          data-no-longpress
          onClick={() => activeTool && onToggle(dateKey)}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, dateKey); }}
          style={{ cursor: sectionLabel && !activeTool ? 'grab' : (activeTool ? 'pointer' : 'default'), opacity: isDragging ? 0.4 : 1, ...headerStyle }}
          className={`relative flex items-center justify-between mx-0.5 my-0.5 px-1.5 py-1 select-none min-h-[34px] ${headerColor} ${isToday ? 'ring-2 ring-blue-400' : ''}`}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-none gap-[3px]">
            <span className="text-[8px] font-semibold uppercase tracking-wider whitespace-nowrap opacity-60">{formatFullDate(date)}</span>
            {headerLabel && (
              <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">{headerLabel}</span>
            )}
          </div>
        <span className="w-5 shrink-0 flex justify-center">
          {violations.length > 0 && (
            <ViolationTooltip violations={violations}>
              <Flag className="w-2.5 h-2.5 fill-red-400 shrink-0 text-red-400" />
            </ViolationTooltip>
          )}
        </span>
        </div>
      <div ref={bodyRef} onScroll={checkScroll} className="flex-1 overflow-y-auto overscroll-contain min-h-0 mx-0.5" style={{ WebkitMaskImage: scrollMask, maskImage: scrollMask }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('[data-row-id]')) return;
          if (!bodyTargetRowId) return;
          e.preventDefault();
          onBodyContextMenu?.(e, bodyTargetRowId);
        }}
      >
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {rows.map((r, i, arr) => (
            <React.Fragment key={r.id}>
              {activeRowId && activeDragRows.length > 0 && insertBeforeId === r.id && (
                <div className="opacity-40 flex flex-col gap-0">
                  {activeDragRows.slice(0, 3).map(dr => (
                    <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
                  ))}
                  {activeDragRows.length > 3 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 3} more</div>}
                </div>
              )}
<SceneCard row={r} scene={scenes.find(s => s.id === r.sceneId)} displayField={displayField} violations={sceneViolationMap.get(r.sceneId || '')} isSelected={selectedIds?.has(r.id) ?? false} isFaded={activeDragIds?.has(r.id) ?? false} onToggle={onRowClick} onDoubleClick={onRowDoubleClick} onContextMenu={onRowContextMenu} />
              {activeRowId && activeDragRows.length > 0 && i === arr.length - 1 && insertBeforeId === `day-${dateKey}` && (
                <div className="opacity-40 flex flex-col gap-0">
                  {activeDragRows.slice(0, 3).map(dr => (
                    <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
                  ))}
                  {activeDragRows.length > 3 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 3} more</div>}
                </div>
              )}
            </React.Fragment>
          ))}
          {rows.length === 0 && sectionIndex != null && activeRowId && activeDragRows.length > 0 && insertBeforeId === `day-${dateKey}` && (
            <div className="opacity-40 flex flex-col gap-0">
              {activeDragRows.slice(0, 3).map(dr => (
                <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
              ))}
              {activeDragRows.length > 3 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 3} more</div>}
            </div>
          )}
        </SortableContext>
        <div ref={setEndRef} className="h-1 w-full shrink-0" />
      </div>
    </div>
  );
};

export const FillerCell: React.FC = () => (
  <div className="min-h-[80px] h-full border-r border-b border-dashed border-zinc-200 bg-zinc-50/30" />
);
