import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragStartEvent, DragOverlay, DragOverEvent, PointerSensor, TouchSensor, useSensor, useSensors, closestCorners, CollisionDetection } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProject } from '../store';
import { ScheduleRow, Scene, RuleViolation, SceneColorPalette, NonShootDate } from '../types';
import { generateUUID } from '../lib/utils';
import { resolveSceneColor, getNoteBannerColors, getSelectedStripColors, getFallbackStripColors, getDayHeaderColors, getDayFooterColors } from '../lib/ribbonUtils';
import { ChevronLeft, ChevronRight, GripVertical, Flag, X, Pointer, Eraser, Trash2, Briefcase, Pause, Plane, Sun, Plus, Check, ChevronDown, AlignLeft, StickyNote, Eye, EyeOff, CalendarDays } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { StripboardContextMenuContent } from './StripboardContextMenuContent';
import { useStripboardContextMenu } from '../lib/useStripboardContextMenu';
import { checkSection } from '../lib/rulesEngine';
import { ViolationTooltip } from './ViolationTooltip';
import { EntityDropdown } from './EntityDropdown';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import { useMarquee, MarqueeOverlay, useAddMode, isAddModeActive } from '../lib/useMarquee';
import { useMarqueeMode, getMarqueeMode } from '../lib/useLongPressMenu';
import { IS_COARSE } from '../lib/device';
import { usePersistState } from '../lib/persist';
import { useCurrentWindow, useCurrentDocument } from '../lib/popoutTarget';
import { getLabel, ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../lib/categories';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import DropdownSubmenu from './DropdownSubmenu';
import SortDropdown from './SortDropdown';
import { compareByCustomOrder, getLockedTiebreakerResult } from './SortDropdown';
import { CustomOrderSortModal, useCustomOrderSort } from './CustomOrderSortModal';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import PageToolbar from './PageToolbar';

const SIDEBAR_KEY = 'lemon_schedule_calendar_sidebar_width';
const SIDEBAR_COLLAPSED_KEY = 'lemon_schedule_calendar_sidebar_collapsed';

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cursor = new Date(year, month, 1 - startOfWeek);
  const todayKey = toDateKey(new Date());
  const days: { date: Date; dateKey: string; isCurrentMonth: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const isCurrentMonth = cursor.getMonth() === month;
    days.push({ date: new Date(cursor), dateKey: toDateKey(cursor), isCurrentMonth, isToday: toDateKey(cursor) === todayKey });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const SceneCardContent: React.FC<{ row: ScheduleRow; scene?: Scene; displayField: string; violations?: RuleViolation[]; isSelected?: boolean; selBg?: string; selColor?: string }> = ({ row, scene, displayField, violations, isSelected, selBg, selColor }) => {
  const { state } = useProject();
  const palette = state.present.colorPalette;
  const sz = IS_COARSE ? 'text-xs px-2 py-1' : 'text-[9px] px-1.5 py-0.5';
  if (!scene) {
    const label = row.type === 'BREAK' ? row.breakLabel || 'BREAK' : row.type === 'NOTE' ? row.noteText || 'Note' : row.type === 'DAYBREAK' ? row.daybreakLabel || 'End of Day' : null;
    if (!label) return null;
    const nb = getNoteBannerColors(palette);
    const df = getDayFooterColors(palette);
    const bg = row.type === 'DAYBREAK' ? df.background : row.noteColor || nb.background;
    const fg = row.type === 'DAYBREAK' ? df.color : row.noteTextColor || nb.color;
    return (
      <div style={{ background: bg, color: fg }} className={`${sz} font-semibold truncate border-b border-black select-none cursor-grab ${row.type === 'NOTE' ? 'italic' : ''}`}>
        {label}
      </div>
    );
  }
  const getDisplayValue = (): string => {
    if (displayField === 'description') return scene.description;
    if (displayField === 'cast') {
      const ids = scene.cast.split(',').map(s => s.trim()).filter(Boolean);
      const members = state.present.castMembers || [];
      return ids.map(id => members.find(m => m.id === id)?.name || id).join(', ');
    }
    return (scene as any)[displayField] || '';
  };
  const c = resolveSceneColor(scene.intExt || '', scene.dayNight || '', palette?.sceneColors, getFallbackStripColors(palette), scene, palette?.colorRules);
  const bg = isSelected && selBg ? selBg : c.background;
  const fg = isSelected && selColor ? selColor : c.color;
  const vFlag = violations && violations.length > 0 ? (
    <ViolationTooltip violations={violations}>
      <Flag className="w-2 h-2 text-red-500 fill-red-500 shrink-0" />
    </ViolationTooltip>
  ) : null;
  return (
    <div style={{ background: bg, color: fg }} className={`${sz} truncate leading-tight whitespace-nowrap font-semibold flex items-center gap-0.5 border-b border-black select-none cursor-grab`}>
      <span className="truncate">{scene.sceneNumber}. {getDisplayValue()}</span>
      {vFlag}
    </div>
  );
};

const SceneCard: React.FC<{ row: ScheduleRow; scene?: Scene; displayField: string; violations?: RuleViolation[]; isSelected?: boolean; isFaded?: boolean; onToggle?: (id: string, e: React.MouseEvent) => void; onDoubleClick?: (id: string) => void; onContextMenu?: (e: React.MouseEvent) => void }> = ({ row, scene, displayField, violations, isSelected, isFaded, onToggle, onDoubleClick, onContextMenu }) => {
  const { state } = useProject();
  const sel = getSelectedStripColors(state.present.colorPalette);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { type: 'SCENE_CARD', row, scene },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.3 } : {}),
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
  };
    return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      onClick={(e) => onToggle?.(row.id, e)}
      onDoubleClick={(e) => { e.preventDefault(); onDoubleClick?.(row.id, e.shiftKey); }}
      onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(e); } }}
      data-row-id={row.id}
      data-container-id={row.containerId == null ? 'null' : row.containerId}
      className={`${isSelected && !isFaded ? 'shadow-[4px_0_0_0_#000000,-4px_0_0_0_#000000,0_2px_0_0_#000000,0_-2px_0_0_#000000] z-10' : ''} ${isFaded ? 'opacity-30' : ''}`}>
      <SceneCardContent row={row} scene={scene} displayField={displayField} violations={violations} isSelected={isSelected} selBg={sel.background} selColor={sel.color} />
    </div>
  );
};

const DayCell: React.FC<{
  dateKey: string; date: Date; isCurrentMonth: boolean; isToday: boolean;
  rows: ScheduleRow[]; scenes: Scene[]; displayField: string;
  violations: RuleViolation[];
  sceneViolationMap: Map<string, RuleViolation[]>;
  onToggle: (dateKey: string) => void;
  onContextMenu?: (e: React.MouseEvent, dateKey: string) => void;
  nonShootStatus?: string;
  sectionIndex?: number;
  sectionLabel?: string;
  label?: string | null;
  activeTool?: string | null;
  selectedIds?: Set<string>;
  activeDragIds?: Set<string>;
  onRowClick?: (id: string, e: React.MouseEvent) => void;
  insertBeforeId?: string | null;
  activeDragRow?: ScheduleRow | null;
  activeDragRows?: ScheduleRow[];
  activeRowId?: string | null;
  monthSeparator?: string | null;
  onRowDoubleClick?: (id: string) => void;
  onRowContextMenu?: (e: React.MouseEvent) => void;
  palette?: SceneColorPalette;
  activeDragDay?: number | null;
}> = ({ dateKey, date, isCurrentMonth, isToday, rows, scenes, displayField, violations, sceneViolationMap, onToggle, onContextMenu, nonShootStatus, sectionIndex, sectionLabel, label, activeTool, selectedIds, activeDragIds, onRowClick, insertBeforeId, activeDragRow, activeDragRows = [], activeRowId, monthSeparator, onRowDoubleClick, onRowContextMenu, palette, activeDragDay }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateKey}`,
    data: { type: 'DAY_CELL', date: dateKey, sectionIndex },
  });

  const { setNodeRef: setDragRef, attributes: dragAttributes, listeners: dragListeners, isDragging } = useDraggable({
    id: `day-section-${sectionIndex ?? -1}`,
    data: { type: 'DAY', sectionIndex },
    disabled: !sectionLabel || !!activeTool,
  });

  const { setNodeRef: setEndRef } = useDroppable({
    id: `end-${dateKey}`,
    data: { type: 'STRIP_END', date: dateKey, sectionIndex },
    disabled: !!nonShootStatus,
  });

  const statusBadge = nonShootStatus === 'hold' ? 'H' : nonShootStatus === 'travel' ? 'T' : nonShootStatus === 'holiday' ? 'DO' : null;
  const statusBg = nonShootStatus === 'hold' ? 'bg-red-50' : nonShootStatus === 'travel' ? 'bg-purple-50' : nonShootStatus === 'holiday' ? 'bg-zinc-200' : '';
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

  return (
    <div ref={setNodeRef}
      className={`min-h-[80px] h-full border-r flex flex-col relative
        ${!isWorking && !nonShootStatus ? 'border-b border-dashed border-zinc-200' : 'border-b border-zinc-200'}
        ${!isCurrentMonth ? 'bg-zinc-50/50 text-zinc-300' : !isWorking && !nonShootStatus ? 'bg-zinc-50 text-zinc-400' : statusBg || 'bg-zinc-50'}
        ${isOver && !isNonShoot ? '!bg-blue-50' : ''}`}
    >
        {label && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-white text-[7px] font-bold text-zinc-800 shadow-sm border border-zinc-300 leading-none z-20">
            {label}
          </span>
        )}
        {monthSeparator && (
          <div className="text-center text-[9px] font-bold text-zinc-400 uppercase tracking-wider py-0.5 bg-zinc-50 border-b border-zinc-200">
            {monthSeparator}
          </div>
        )}
        <div
          ref={setDragRef}
          {...dragListeners}
          {...dragAttributes}
          onClick={() => activeTool && onToggle(dateKey)}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, dateKey); }}
          style={{ cursor: sectionLabel && !activeTool ? 'grab' : (activeTool ? 'pointer' : 'default'), opacity: isDragging ? 0.4 : 1, ...headerStyle }}
        className={`flex items-center justify-between mx-0.5 my-0.5 px-1.5 py-1 select-none min-h-[26px] ${headerColor} ${isCurrentMonth ? '' : 'opacity-30'} ${isToday ? 'ring-2 ring-blue-400' : ''} ${isOver && activeDragDay != null && sectionIndex != null ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      >
        <span className="text-[10px] font-bold w-5 text-center leading-none">{date.getDate()}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider flex-1 text-center">{headerLabel}</span>
        <span className="w-5 flex justify-center">
          {violations.length > 0 && (
            <ViolationTooltip violations={violations}>
              <Flag className="w-2.5 h-2.5 fill-red-400 shrink-0 text-red-400" />
            </ViolationTooltip>
          )}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 mx-0.5">
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

const BoneyardSidebar: React.FC<{
  rows: ScheduleRow[];
  scenes: Scene[];
  displayField: string;
  sceneViolationMap: Map<string, RuleViolation[]>;
  activeDragRows?: ScheduleRow[];
  insertBeforeId?: string | null;
  activeRowId?: string | null;
  activeDragIds?: Set<string>;
  selectedIds?: Set<string>;
  onRowClick?: (id: string, e: React.MouseEvent) => void;
  onSort?: (criterion: string, direction: 'asc' | 'desc') => void;
  onCustomSort?: (criterion: string) => void;
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc';
  lockedCriteria?: string[];
  onToggleLock?: (criterion: string) => void;
  sortCategories?: { key: string; label: string }[];
  intExtSortLabel?: string;
  dayNightSortLabel?: string;
  onRowDoubleClick?: (id: string) => void;
  onRowContextMenu?: (e: React.MouseEvent) => void;
}> = ({ rows, scenes, displayField, sceneViolationMap, activeDragRows = [], insertBeforeId, activeRowId, activeDragIds, selectedIds, onRowClick, onSort, onCustomSort, sortBy, sortDir = 'asc' as 'asc' | 'desc', lockedCriteria = [], onToggleLock, sortCategories = [], intExtSortLabel, dayNightSortLabel, onRowDoubleClick, onRowContextMenu }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'boneyard', data: { type: 'BONEYARD' } });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [width, setWidth] = useState<number>(() => {
    try { const v = localStorage.getItem(SIDEBAR_KEY); return v ? parseInt(v, 10) : 200; } catch { return 200; }
  });
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);
  const currentDocument = useCurrentDocument();
  const currentDocumentRef = useRef(currentDocument);
  currentDocumentRef.current = currentDocument;

  useEffect(() => {
    widthRef.current = width;
    localStorage.setItem(SIDEBAR_KEY, String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth || widthRef.current;
    const handlePointerMove = (e: PointerEvent) => {
      const newWidth = Math.min(400, Math.max(160, startWidth + e.clientX - startX));
      widthRef.current = newWidth;
      if (panelRef.current) panelRef.current.style.width = `${newWidth}px`;
    };
    const handlePointerUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth(widthRef.current);
      currentDocumentRef.current.removeEventListener('pointermove', handlePointerMove);
      currentDocumentRef.current.removeEventListener('pointerup', handlePointerUp);
    };
    currentDocumentRef.current.addEventListener('pointermove', handlePointerMove);
    currentDocumentRef.current.addEventListener('pointerup', handlePointerUp);
  }, []);

  return (
    <div ref={panelRef}
      className={`${isCollapsed ? 'w-[44px] bg-zinc-50' : 'bg-zinc-50'} border-r border-zinc-200 flex flex-col shrink-0 relative overflow-hidden`}
      style={isCollapsed ? undefined : { width: `${width}px` }}
    >
      {isCollapsed ? (
        <div
          className="flex flex-col items-center py-4 h-full cursor-pointer hover:bg-zinc-100 w-full"
          onClick={() => setIsCollapsed(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setIsCollapsed(false); }}
            className="p-1.5 hover:bg-zinc-200 rounded transition-colors text-zinc-500 hover:text-zinc-800 mb-6 cursor-pointer"
            title="Expand Sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center justify-center">
            <span
              className="text-zinc-400 font-bold tracking-widest text-[11px] select-none uppercase whitespace-nowrap"
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
            >
              BONEYARD ({rows.length})
            </span>
          </div>
        </div>
      ) : (
        <>
      <div className="px-3 pt-2 pb-2 border-b shrink-0 bg-zinc-50 border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-zinc-800 font-bold text-sm tracking-widest shrink-0">BONEYARD</span>
            <span className="text-zinc-300 select-none shrink-0">·</span>
            <span className="text-xs text-zinc-500 shrink-0">{rows.length} Items</span>
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 hover:bg-zinc-200 rounded text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer shrink-0"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        {onSort && (
          <div className="flex items-center gap-2 mt-2">
            <SortDropdown
              open={showSortMenu}
              onOpenChange={setShowSortMenu}
              sortBy={sortBy ?? null}
              sortDir={sortDir}
              lockedCriteria={lockedCriteria}
              onToggleLock={onToggleLock ?? (() => {})}
              onSort={onSort}
              onCustomSort={onCustomSort}
              categories={sortCategories}
              intExtLabel={intExtSortLabel}
              dayNightLabel={dayNightSortLabel}
            />
          </div>
        )}
      </div>
      <div ref={setNodeRef} className={`flex-1 overflow-y-auto px-2 pt-2 pb-20 flex flex-col gap-0 ${isOver ? 'bg-blue-50' : ''}`}>
        {rows.map((r, i, arr) => (
          <React.Fragment key={r.id}>
            {activeRowId && activeDragRows.length > 0 && insertBeforeId === r.id && (
              <div className="opacity-40 flex flex-col gap-0 mb-0.5">
                {activeDragRows.slice(0, 2).map(dr => (
                  <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
                ))}
                {activeDragRows.length > 2 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 2} more</div>}
              </div>
            )}
            <SceneCard row={r} scene={scenes.find(s => s.id === r.sceneId)} displayField={displayField} violations={sceneViolationMap.get(r.sceneId || '')} isSelected={selectedIds?.has(r.id) ?? false} isFaded={activeDragIds?.has(r.id) ?? false} onToggle={onRowClick} onDoubleClick={onRowDoubleClick} onContextMenu={onRowContextMenu} />
            {activeRowId && activeDragRows.length > 0 && i === arr.length - 1 && insertBeforeId === 'end-boneyard' && (
              <div className="opacity-40 flex flex-col gap-0">
                {activeDragRows.slice(0, 2).map(dr => (
                  <SceneCardContent key={dr.id} row={dr} scene={scenes.find(s => s.id === dr.sceneId)} displayField={displayField} />
                ))}
                {activeDragRows.length > 2 && <div className="text-[8px] text-zinc-400 text-center">+{activeDragRows.length - 2} more</div>}
              </div>
            )}
          </React.Fragment>
        ))}
        {rows.length === 0 && <div className="text-center text-zinc-400 text-[10px] py-8">All scenes scheduled</div>}
      </div>
      <div
        className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-blue-400/40 z-30"
        onPointerDown={handleResizeStart}
        data-no-longpress
      />
        </>
      )}
    </div>
  );
};

export const CalendarTab: React.FC<{ onOpenScene?: (sceneId: string) => void; onOpenSceneInPopout?: (sceneId: string) => void }> = ({ onOpenScene, onOpenSceneInPopout }) => {
  const { state, dispatch } = useProject();
  const currentWindow = useCurrentWindow();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { productionDays, productionSections, sectionDateMap: hookSectionDateMap, productionChronoDayMap } = useDaybreakSections();

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(() => activeVersion?.productionStart || today);

  useEffect(() => {
    if (activeVersion?.productionStart) setStartDate(activeVersion.productionStart);
  }, [activeVersion?.productionStart]);

  const containerDay = useMemo(() => {
    if (!activeVersion) return 1;
    const days = activeVersion.rows.filter(r => r.containerId != null).map(r => r.containerId!);
    return days.length > 0 ? Math.min(...days) : 1;
  }, [activeVersion]);

  const updateStartDate = useCallback((d: string) => {
    setStartDate(d);
    if (activeVersion) {
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, productionStart: d } });
    }
  }, [activeVersion, dispatch, containerDay]);

  const didInit = useRef(false);
  useEffect(() => {
    if (!activeVersion || didInit.current) return;
    if (activeVersion.productionStart) return;
    didInit.current = true;
    const sd = new Date().toISOString().slice(0, 10);
    updateStartDate(sd);
  }, [activeVersion, updateStartDate]);

  const nonShootDates = useMemo(() => activeVersion?.nonShootDates || [], [activeVersion?.nonShootDates]);

  const [calSettings, setCalSettings] = usePersistState<{ displayField: string; showBreaks: boolean; showConflicts: boolean }>('lemon_schedule_calendar_view', {
    displayField: 'set',
    showBreaks: true,
    showConflicts: true,
  });
  const { displayField, showBreaks, showConflicts } = calSettings;
  const updateCal = (patch: Partial<typeof calSettings>) => setCalSettings(prev => ({ ...prev, ...patch }));

  const [currentMonth, setCurrentMonth] = useState(() => new Date(startDate + 'T00:00:00').getMonth());
  const [currentYear, setCurrentYear] = useState(() => new Date(startDate + 'T00:00:00').getFullYear());

  useEffect(() => {
    const d = new Date(startDate + 'T00:00:00');
    setCurrentMonth(d.getMonth());
    setCurrentYear(d.getFullYear());
  }, [startDate]);
  const [activeDragRow, setActiveDragRow] = useState<ScheduleRow | null>(null);
  const [activeDragDay, setActiveDragDay] = useState<number | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [statusModal, setStatusModal] = useState<{ containerId: number; dateKey: string } | null>(null);
  const [modalStatus, setModalStatus] = useState('work');
  const [modalCastIds, setModalCastIds] = useState('');
  const [autoDayOffOpen, setAutoDayOffOpen] = useState(false);
  const [autoDayOffDays, setAutoDayOffDays] = useState<Set<number>>(new Set([5, 6]));

  const handleNonShootToggle = useCallback((dateKey: string, status: 'hold' | 'travel' | 'holiday' | null) => {
    if (!activeVersion) return;
    const current = activeVersion.nonShootDates || [];
    let next: NonShootDate[];
    if (status === null) {
      next = current.filter(ns => ns.date !== dateKey);
    } else {
      const exists = current.find(ns => ns.date === dateKey);
      if (exists) {
        next = current.map(ns => ns.date === dateKey ? { ...ns, status } : ns);
      } else {
        next = [...current, { date: dateKey, status }];
      }
    }
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, nonShootDates: next } });
  }, [activeVersion, dispatch]);

  const [contextMenuDate, setContextMenuDate] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeDragIds, setActiveDragIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const activeDragIdsRef = useRef(activeDragIds);
  activeDragIdsRef.current = activeDragIds;
  const selectedRowIdsRef = useRef(selectedRowIds);
  selectedRowIdsRef.current = selectedRowIds;
  const lastClickedIdRef = useRef(lastClickedId);
  lastClickedIdRef.current = lastClickedId;
  const boneyardFlatRef = useRef<string[]>([]);

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const { pointerCoordinates, droppableContainers } = args;
    const filteredContainers = droppableContainers.filter((container) => {
      if (activeDragIdsRef.current.has(container.id as string)) return false;
      return true;
    });
    if (pointerCoordinates) {
      const collisions: { id: string; distance: number; area: number }[] = [];
      for (const container of filteredContainers) {
        const rect = container.rect.current;
        if (rect) {
          const dx = Math.max(rect.left - pointerCoordinates.x, 0, pointerCoordinates.x - rect.right);
          const dy = Math.max(rect.top - pointerCoordinates.y, 0, pointerCoordinates.y - rect.bottom);
          const distance = Math.sqrt(dx * dx + dy * dy);
          const area = rect.width * rect.height;
          collisions.push({ id: container.id as string, distance, area });
        }
      }
      collisions.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.area - b.area;
      });
      if (collisions.length > 0) return collisions.map(c => ({ id: c.id }));
    }
    return closestCorners({ ...args, droppableContainers: filteredContainers });
  }, []);

  const ctrlOrCmdHeld = useAddMode();
  const marqueeMode = useMarqueeMode();
  const calendarGridRef = useRef<HTMLDivElement>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    const onBlur = () => setShiftHeld(false);
    currentWindow.addEventListener('keydown', onDown);
    currentWindow.addEventListener('keyup', onUp);
    currentWindow.addEventListener('blur', onBlur);
    return () => {
      currentWindow.removeEventListener('keydown', onDown);
      currentWindow.removeEventListener('keyup', onUp);
      currentWindow.removeEventListener('blur', onBlur);
    };
  }, [currentWindow]);
  const { marqueeBox, justEndedRef: marqueeJustEndedRef } = useMarquee(
    calendarGridRef,
    useCallback((ids) => {
      const filtered = new Set([...ids].filter(id => !id.startsWith('empty-') && !id.startsWith('empty-date-')));
      setSelectedRowIds(prev => isAddModeActive() ? new Set([...prev, ...filtered]) : filtered);
    }, []),
    true,
  );

  const sensors = useSensors(
    IS_COARSE
      ? useSensor(TouchSensor, {
          activationConstraint: activeTool || ctrlOrCmdHeld || marqueeMode !== 'off'
            ? { delay: 999999, tolerance: 0 }
            : { delay: 200, tolerance: 5 }
        })
      : useSensor(PointerSensor, {
          activationConstraint: { distance: activeTool ? 999999 : (ctrlOrCmdHeld || marqueeMode !== 'off' ? 999999 : 3) }
        })
  );

  const days = useMemo(() => getCalendarDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const openAutoDayOff = useCallback(() => {
    setAutoDayOffOpen(true);
  }, []);

  const handleApplyAutoDaysOff = useCallback(() => {
    if (!activeVersion || days.length === 0) return;
    const from = days[0].dateKey;
    const to = days[days.length - 1].dateKey;
    const fromDate = new Date(from + 'T00:00:00');
    const toDate = new Date(to + 'T00:00:00');
    const current = activeVersion.nonShootDates || [];
    const targetDates = new Set<string>();
    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const jsDay = cursor.getDay();
      const monBased = jsDay === 0 ? 6 : jsDay - 1;
      if (autoDayOffDays.has(monBased)) {
        targetDates.add(toDateKey(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    let next = current.filter(ns => {
      if (ns.date < from || ns.date > to) return true;
      return targetDates.has(ns.date);
    });
    for (const date of targetDates) {
      if (!next.find(ns => ns.date === date)) {
        next.push({ date, status: 'holiday' as const });
      }
    }
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, nonShootDates: next } });
    setAutoDayOffOpen(false);
  }, [activeVersion, days, autoDayOffDays, dispatch]);

  const nonShootDateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const ns of nonShootDates) m.set(ns.date, ns.status);
    return m;
  }, [nonShootDates]);

  const sectionDateMap = hookSectionDateMap;
  const chronoDayMap = productionChronoDayMap;
  const sections = productionDays;
  const calendarSections = productionSections;

  const workingLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const workingDates = [...new Set<string>(
      productionSections.map(s => sectionDateMap.get(s.index)).filter((d): d is string => !!d && !nonShootDateMap.has(d))
    )].sort();
    if (workingDates.length === 0) return labels;
    labels.set(workingDates[0], 'SW');
    if (workingDates.length > 1) labels.set(workingDates[workingDates.length - 1], 'FW');
    for (let i = 1; i < workingDates.length - 1; i++) {
      labels.set(workingDates[i], 'W');
    }
    return labels;
  }, [productionSections, sectionDateMap, nonShootDateMap]);

  const availableFields = useMemo(() => {
    const hiddenSet = new Set(project.hiddenCategories || []);
    const fields: { key: string; label: string }[] = [
      { key: 'description', label: 'Description' },
    ];
    for (const cat of ELEMENT_CATEGORIES) {
      if (!hiddenSet.has(cat.key)) {
        fields.push({ key: cat.key, label: getLabel(cat.key, cat.label, project.categoryLabels) });
      }
    }
    for (const cat of project.customCategories || []) {
      if (!hiddenSet.has(cat.key)) {
        fields.push({ key: cat.key, label: cat.label });
      }
    }
    return fields;
  }, [project.hiddenCategories, project.customCategories, project.categoryLabels]);

  const violationMap = useMemo(() => {
    const m = new Map<string, RuleViolation[]>();
    if (!activeVersion || !showConflicts) return m;
    const firstDaybreak = activeVersion.rows.find(r => r.type === 'DAYBREAK');
    let baseTime = firstDaybreak?.daybreakCallTime || '08:00';
    for (const s of sections) {
      const dateKey = sectionDateMap.get(s.index);
      if (!dateKey) continue;
      const v = checkSection(s.rows, dateKey, baseTime, project.rules || [], project.scenes, project.castMembers || []);
      if (v.length > 0) m.set(dateKey, v);
      baseTime = s.daybreakRow?.daybreakCallTime || baseTime;
    }
    return m;
  }, [activeVersion, project.rules, project.scenes, project.castMembers, showConflicts, sections, sectionDateMap]);

  const sceneViolationMap = useMemo(() => {
    const m = new Map<string, RuleViolation[]>();
    for (const [, violations] of violationMap) {
      for (const v of violations) {
        const ids = v.sceneIds || (v.sceneId ? [v.sceneId] : []);
        for (const sid of ids) {
          if (!m.has(sid)) m.set(sid, []);
          m.get(sid)!.push(v);
        }
      }
    }
    return m;
  }, [violationMap]);

  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [colorPicker, setColorPicker] = useState<{ rowId: string; bg: string; text: string; noteText: string; originalBg: string; originalText: string; originalNoteText: string } | null>(null);

  const scrollToRow = useCallback((rowId: string) => {
    const el = document.querySelector(`[data-row-id="${rowId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  const {
    contextMenu,
    setContextMenu,
    inClipboard,
    cutSelected,
    pasteClipboard,
    handleContextMenuAction,
    createOnContextMenu,
    selectNextAfterRemove,
  } = useStripboardContextMenu({
    selectedRowIds,
    setSelectedRowIds,
    rows: (activeVersion?.rows || []),
    activeVersion,
    activeDragIds,
    textEditingEnabled: false,
    dispatch,
    setFocusedRowId,
    scrollToRow,
    setColorPicker,
    project,
  });

  const handleRowContextMenu = useCallback((e: React.MouseEvent) => {
    setContextMenuDate(null);
    (createOnContextMenu()(e));
  }, [createOnContextMenu]);

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    if (!activeVersion) return map;
    for (const s of sections) {
      const dateKey = sectionDateMap.get(s.index);
      if (!dateKey) continue;
      const allRows = s.rows.filter(r => {
        if (r.containerId === -1) return false;
        if (activeDragIds.has(r.id)) return false;
        if (!showBreaks && (r.type === 'BREAK' || r.type === 'NOTE' || r.type === 'DAYBREAK')) return false;
        return true;
      });
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(...allRows);
    }
    return map;
  }, [sections, sectionDateMap, activeDragIds, showBreaks, activeVersion]);

  const dateSectionMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, v] of sectionDateMap) m.set(v, k);
    return m;
  }, [sectionDateMap]);

  const sectionRowIds = useMemo(() => new Set(sections.flatMap(s => s.rows.map(r => r.id))), [sections]);

  const boneyardRows = useMemo(() => {
    return (activeVersion?.rows || []).filter(r => {
      if (activeDragIds.has(r.id)) return false;
      if (r.containerId === -1) return false;
      if (!showBreaks && (r.type === 'BREAK' || r.type === 'NOTE' || r.type === 'DAYBREAK')) return false;
      if (r.containerId === null && r.type !== 'DAYBREAK') return true;
      if (r.containerId != null && !sectionRowIds.has(r.id) && r.type !== 'DAYBREAK') return true;
      return false;
    }).sort((a, b) => a.order - b.order);
  }, [(activeVersion?.rows || []), activeDragIds, showBreaks, sectionRowIds]);

  boneyardFlatRef.current = boneyardRows.map(r => r.id);

  const handleToggle = useCallback((dateKey: string) => {
    if (activeTool) {
      if (activeTool === 'remove') {
        handleNonShootToggle(dateKey, null);
      } else {
        handleNonShootToggle(dateKey, activeTool as 'hold' | 'travel' | 'holiday');
      }
      return;
    }
  }, [handleNonShootToggle, activeTool]);

  const sortBoneyard = useCallback((criterion: string, direction: 'asc' | 'desc') => {
    if (!activeVersion) return;
    const scheduled = activeVersion.rows.filter(r => r.containerId !== null);
    const boneyard: ScheduleRow[] = activeVersion.rows.filter(r => r.containerId === null);
    const sign = direction === 'desc' ? -1 : 1;
    boneyard.sort((a, b) => {
      if (a.type !== 'SCENE' && b.type === 'SCENE') return 1;
      if (a.type === 'SCENE' && b.type !== 'SCENE') return -1;
      if (a.type !== 'SCENE' && b.type !== 'SCENE') return 0;
      const sA = project.scenes.find(s => s.id === a.sceneId);
      const sB = project.scenes.find(s => s.id === b.sceneId);
      if (!sA || !sB) return 0;

      const locks = lockedCriteriaRef.current.filter(l => l !== criterion);
      if (locks.length > 0) {
        const tie = getLockedTiebreakerResult(locks, '', sA, sB, customSortOrdersRef.current, a.estimatedDuration, b.estimatedDuration);
        if (tie !== 0) return tie;
      }

      let cmp = 0;
      if (criterion === 'scene_number') cmp = sA.sceneNumber.localeCompare(sB.sceneNumber, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      else if (criterion === 'script_day') cmp = sA.scriptDay.localeCompare(sB.scriptDay, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      else if (criterion === 'page_count') cmp = ((sA.pageCountDecimal || 0) - (sB.pageCountDecimal || 0)) * sign;
      else if (criterion === 'duration') cmp = ((a.estimatedDuration || 0) - (b.estimatedDuration || 0)) * sign;
      else if (criterion === 'int_ext') {
        const customCmp = customSortOrdersRef.current['int_ext'] ? compareByCustomOrder(customSortOrdersRef.current['int_ext'], s => s.intExt) : null;
        if (customCmp) cmp = customCmp(sA, sB);
        else cmp = ((sA.intExt || '') as string).localeCompare((sB.intExt || '') as string) * sign;
      } else if (criterion === 'day_night') {
        const customCmp = customSortOrdersRef.current['day_night'] ? compareByCustomOrder(customSortOrdersRef.current['day_night'], s => s.dayNight) : null;
        if (customCmp) cmp = customCmp(sA, sB);
        else cmp = ((sA.dayNight || '') as string).localeCompare((sB.dayNight || '') as string) * sign;
      } else if (criterion === 'set_name' || criterion === 'set') cmp = sA.set.localeCompare(sB.set) * sign;
      else {
        const valA = String((sA as any)?.[criterion] ?? '');
        const valB = String((sB as any)?.[criterion] ?? '');
        cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      }

      return cmp;
    });
    const combined = [...scheduled, ...boneyard];
    const finalRows = combined.map((r, i) => ({ ...r, order: i }));
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: finalRows } });
  }, [activeVersion, project.scenes, dispatch]);

  const sortCategoryEntries = useMemo(() => {
    const cats = ELEMENT_CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: CAT_ICONS[c.key] ? React.createElement(CAT_ICONS[c.key], { className: 'w-3.5 h-3.5' }) : undefined }));
    for (const cc of project.customCategories) {
      const Icon = getCustomIcon(cc.icon || 'Tag');
      cats.push({ key: cc.key, label: cc.label, icon: React.createElement(Icon, { className: 'w-3.5 h-3.5' }) });
    }
    return cats;
  }, [project.customCategories]);

  const [calSortBy, setCalSortBy] = useState<string | null>(null);
  const [calSortDir, setCalSortDir] = useState<'asc' | 'desc'>('asc');
  const [customSortOrders, setCustomSortOrders] = useState<Record<string, string[]>>({});
  const customSortOrdersRef = useRef(customSortOrders);
  customSortOrdersRef.current = customSortOrders;
  const [lockedCriteria, setLockedCriteria] = useState<string[]>([]);
  const lockedCriteriaRef = useRef(lockedCriteria);
  lockedCriteriaRef.current = lockedCriteria;
  const { customOrderModal, openCustomOrderModal, closeCustomOrderModal } = useCustomOrderSort();

  const handleToggleLock = useCallback((criterion: string) => {
    setLockedCriteria(prev => {
      const next = prev.includes(criterion) ? prev.filter(c => c !== criterion) : [...prev, criterion];
      lockedCriteriaRef.current = next;
      return next;
    });
  }, []);

  const handleCustomSort = useCallback((criterion: string) => {
    const isIntExt = criterion === 'int_ext';
    const options = isIntExt
      ? (project.colorPalette?.intExtOptions || ['INT', 'EXT', 'INT/EXT'])
      : (project.colorPalette?.dayNightOptions || ['DAY', 'NIGHT', 'MORNING', 'EVENING']);
    const title = options.slice(0, 2).join(' / ');
    openCustomOrderModal(criterion, title, options);
  }, [project.colorPalette, openCustomOrderModal]);

  const handleCustomOrderSort = useCallback((criterion: string, order: string[]) => {
    setCalSortBy(criterion);
    setCalSortDir('asc');
    const next = { ...customSortOrders, [criterion]: order };
    setCustomSortOrders(next);
    customSortOrdersRef.current = next;
    sortBoneyard(criterion, 'asc');
  }, [customSortOrders, sortBoneyard]);

  const intExtSortLabel = useMemo(() => {
    const opts = project.colorPalette?.intExtOptions;
    return opts?.length ? opts.slice(0, 2).join(' / ') : undefined;
  }, [project.colorPalette?.intExtOptions]);

  const dayNightSortLabel = useMemo(() => {
    const opts = project.colorPalette?.dayNightOptions;
    return opts?.length ? opts.slice(0, 2).join(' / ') : undefined;
  }, [project.colorPalette?.dayNightOptions]);

  const handleCalSort = useCallback((criterion: string, direction: 'asc' | 'desc') => {
    setCalSortBy(criterion);
    setCalSortDir(direction);
    sortBoneyard(criterion, direction);
  }, [sortBoneyard]);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (e.altKey) return;
    if (marqueeJustEndedRef.current) {
      marqueeJustEndedRef.current = false;
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      setSelectedRowIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastClickedId(id);
    } else if (getMarqueeMode() === 'tool') {
      e.stopPropagation();
      setSelectedRowIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastClickedId(id);
    } else if (e.shiftKey && lastClickedId) {
      e.stopPropagation();
      const clickedRow = activeVersion?.rows.find(r => r.id === id);
      const anchorRow = activeVersion?.rows.find(r => r.id === lastClickedId);
      const isBoneyard = (clickedRow && (clickedRow.containerId === null || clickedRow.containerId === -1)) ||
        (anchorRow && (anchorRow.containerId === null || anchorRow.containerId === -1));
      const allIds = isBoneyard ? boneyardFlatRef.current : (activeVersion?.rows || []).map(r => r.id);
      const idxA = allIds.indexOf(lastClickedId);
      const idxB = allIds.indexOf(id);
      if (idxA >= 0 && idxB >= 0) setSelectedRowIds(new Set(allIds.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1)));
    } else {
      e.stopPropagation();
      setSelectedRowIds(new Set([id]));
      setLastClickedId(id);
    }
  };

  const handleRowDoubleClick = useCallback((id: string, shiftKey?: boolean) => {
    if (marqueeMode !== 'off') return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const rowEl = activeEl.closest(`[data-row-id="${id}"]`);
      if (rowEl) return;
    }
    const row = activeVersion?.rows.find(r => r.id === id);
    if (row?.type === 'NOTE') {
      setColorPicker({ rowId: row.id, bg: row.noteColor || '#591b1b', text: row.noteTextColor || '#ffffff', noteText: row.noteText || '', originalBg: row.noteColor || '#591b1b', originalText: row.noteTextColor || '#ffffff', originalNoteText: row.noteText || '' });
    } else if (row?.type === 'SCENE' && row.sceneId) {
      if (!IS_COARSE && shiftKey && onOpenSceneInPopout) {
        onOpenSceneInPopout(row.sceneId);
      } else if (onOpenScene) {
        onOpenScene(row.sceneId);
      }
    }
  }, [activeVersion, onOpenScene, onOpenSceneInPopout, marqueeMode]);

  const applyNoteColor = useCallback(() => {
    if (!colorPicker || !activeVersion) return;
    const newRows = activeVersion.rows.map(r =>
      r.id === colorPicker.rowId ? { ...r, noteColor: colorPicker.bg, noteTextColor: colorPicker.text, noteText: colorPicker.noteText } : r
    );
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
    setColorPicker(null);
  }, [colorPicker, activeVersion, dispatch]);

  const activeType = activeId ? (activeDragDay !== null ? 'DAY' : 'SCENE_CARD') : null;

  const activeDragRows = useMemo(() => {
    if (!activeId || activeType !== 'SCENE_CARD') return [];
    return activeDragIds.size > 1
      ? Array.from(activeDragIds)
          .sort((a, b) => {
            const rA = (activeVersion?.rows || []).find(r => r.id === a);
            const rB = (activeVersion?.rows || []).find(r => r.id === b);
            if (rA && rB) {
              if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
              return rA.order - rB.order;
            }
            return 0;
          })
          .map(id => (activeVersion?.rows || []).find(r => r.id === id)!)
          .filter(Boolean)
      : [(activeVersion?.rows || []).find(r => r.id === activeId)!].filter(Boolean);
  }, [activeId, activeType, activeDragIds, (activeVersion?.rows || [])]);

  const handleDragStart = (e: DragStartEvent) => {
    if (isAddModeActive()) return;
    const data = e.active.data.current as any;
    setActiveId(e.active.id as string);
    if (data?.type === 'DAY') {
      setActiveDragDay(data.sectionIndex);
      setActiveDragRow(null);
      setActiveDragIds(new Set());
      return;
    }
    const draggedId = e.active.id as string;
    const currentSelection = selectedRowIdsRef.current;
    if (currentSelection.has(draggedId) && currentSelection.size > 1) {
      setActiveDragIds(new Set(currentSelection));
    } else {
      if (currentSelection.size > 0) setSelectedRowIds(new Set());
      setActiveDragIds(new Set([draggedId]));
    }
    setActiveDragRow((activeVersion?.rows || []).find(r => r.id === draggedId) || null);
    setActiveDragDay(null);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id as string | undefined;
    if (!overId || activeType !== 'SCENE_CARD') { setInsertBeforeId(null); return; }
    if (overId === 'boneyard') { setInsertBeforeId('end-boneyard'); return; }
    if (overId.startsWith('end-')) { setInsertBeforeId(overId); return; }
    if (overId.startsWith('day-')) { setInsertBeforeId(overId); return; }
    setInsertBeforeId(overId);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const lastInsertId = insertBeforeId;
    setActiveId(null);
    setActiveDragRow(null);
    setActiveDragDay(null);
    setActiveDragIds(new Set());
    setInsertBeforeId(null);
    if (!over || !activeVersion) return;

    const activeData = active.data.current as any;

    if (activeData?.type === 'DAY') {
      const sourceIdx = activeData.sectionIndex as number;
      const overData = over.data.current as any;
      let targetIdx: number | null = null;
      if (overData?.sectionIndex != null) {
        targetIdx = overData.sectionIndex;
      } else if (typeof over.id === 'string' && over.id.startsWith('day-')) {
        const dateKey = over.id.slice(4);
        targetIdx = dateSectionMap.get(dateKey) ?? null;
      }
      if (targetIdx == null || sourceIdx === targetIdx) return;
      if (sourceIdx < 0 || targetIdx < 0 || sourceIdx >= sections.length || targetIdx >= sections.length) return;

      const allRows = activeVersion.rows.map(r => ({ ...r }));
      const boneyard = allRows.filter(r => r.containerId == null);
      const scheduled = allRows.filter(r => r.containerId != null).sort((a, b) => a.order - b.order);

      // Build section blocks matching the sections array structure
      const blocks: { content: ScheduleRow[]; daybreakRow?: ScheduleRow }[] = [];
      let currentContent: ScheduleRow[] = [];
      for (const r of scheduled) {
        if (r.type === 'DAYBREAK') {
          blocks.push({ content: currentContent, daybreakRow: r });
          currentContent = [];
        } else {
          currentContent.push(r);
        }
      }
      // Note: rows after the last DAYBREAK are not included (matching sections derivation)

      const sourceBlock = blocks[sourceIdx];
      const targetBlock = blocks[targetIdx];
      if (!sourceBlock || !targetBlock) return;

      // Swap content between sections
      const swapContent = [...targetBlock.content];
      targetBlock.content = [...sourceBlock.content];
      sourceBlock.content = swapContent;

      if (sourceIdx > 0 && targetIdx > 0) {
        const srcAbove = blocks[sourceIdx - 1].daybreakRow;
        const tgtAbove = blocks[targetIdx - 1].daybreakRow;
        if (srcAbove && tgtAbove) {
          const a = srcAbove.daybreakCallTime;
          const b = tgtAbove.daybreakCallTime;
          console.log(`[SWAP] section ${sourceIdx} <-> ${targetIdx} | callTime ${a} <-> ${b} | scenes ${sourceBlock.content.length} <-> ${targetBlock.content.length}`);
          srcAbove.daybreakCallTime = b;
          tgtAbove.daybreakCallTime = a;
        }
      }

      // Rebuild rows from blocks
      const rebuilt: ScheduleRow[] = [];
      for (const block of blocks) {
        rebuilt.push(...block.content);
        if (block.daybreakRow) rebuilt.push(block.daybreakRow);
      }
      const combined = [...boneyard, ...rebuilt];
      combined.forEach((r, i) => r.order = i);

      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
      return;
    }

    const draggedId = active.id as string;
    const allSelected = new Set(activeDragIds);
    const draggingIds = allSelected.size > 1 ? Array.from(allSelected) : [draggedId];
    draggingIds.sort((a, b) => {
      const rA = (activeVersion?.rows || []).find(r => r.id === a);
      const rB = (activeVersion?.rows || []).find(r => r.id === b);
      if (rA && rB) return rA.order - rB.order;
      return 0;
    });

    let targetDateKey: string | null = null;
    const overData = over.data.current as any;
    if (over.id === 'boneyard') {
      targetDateKey = null;
    } else if (typeof over.id === 'string' && over.id.startsWith('day-')) {
      targetDateKey = over.id.slice(4);
    } else if (typeof over.id === 'string' && over.id.startsWith('end-')) {
      targetDateKey = over.id.slice(4);
    } else {
      const overRow = (activeVersion?.rows || []).find(r => r.id === over.id);
      if (overRow) {
        for (const s of sections) {
          if (s.rows.some(rr => rr.id === overRow.id)) {
            targetDateKey = sectionDateMap.get(s.index) || null;
            break;
          }
        }
      }
    }

    let targetSectionIndex: number | null = null;
    if (targetDateKey) {
      targetSectionIndex = dateSectionMap.get(targetDateKey) ?? null;
    }
    if (targetDateKey && nonShootDateMap.has(targetDateKey)) return;

    const newRows = activeVersion.rows.map(r => ({ ...r }));

    if (targetSectionIndex === null) {
      newRows.filter(r => draggingIds.includes(r.id)).forEach(r => {
        const idx = newRows.findIndex(nr => nr.id === r.id);
        if (idx !== -1) newRows[idx] = { ...newRows[idx], containerId: null, order: 999999 };
      });
      newRows.sort((a, b) => {
        if ((a.containerId === null) !== (b.containerId === null)) return a.containerId === null ? 1 : -1;
        return a.order - b.order;
      });
      newRows.forEach((r, i) => r.order = i);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
      return;
    }

    const targetSection = sections.find(s => s.index === targetSectionIndex);
    if (!targetSection) return;

    const sectionRowIds = new Set(targetSection.rows.map(r => r.id));
    let insertIndex = targetSection.rows.length;
    if (lastInsertId && typeof lastInsertId === 'string' && !lastInsertId.startsWith('day-') && !lastInsertId.startsWith('end-') && !lastInsertId.startsWith('boneyard')) {
      const idx = targetSection.rows.findIndex(r => r.id === lastInsertId);
      if (idx !== -1) insertIndex = idx;
    }

    newRows.filter(r => draggingIds.includes(r.id)).forEach(r => {
      const idx = newRows.findIndex(nr => nr.id === r.id);
      if (idx !== -1 && !sectionRowIds.has(r.id)) newRows.splice(idx, 1);
    });

    let insertAt: number;
    if (targetSection.rows.length > 0) {
      const firstSectionRow = targetSection.rows[0];
      const firstIdx = newRows.findIndex(r => r.id === firstSectionRow.id);
      insertAt = firstIdx !== -1 ? firstIdx + insertIndex : newRows.length;
    } else if (targetSection.daybreakRow) {
      const daybreakIdx = newRows.findIndex(r => r.id === targetSection.daybreakRow!.id);
      insertAt = daybreakIdx !== -1 ? daybreakIdx : newRows.length;
    } else {
      insertAt = newRows.length;
    }

    const draggingItems = draggingIds
      .map(id => (activeVersion?.rows || []).find(r => r.id === id))
      .filter(Boolean) as ScheduleRow[];
    const newItems = draggingItems.map(item => ({ ...item, containerId: 1 }));

    const before = newRows.slice(0, insertAt).filter(r => !draggingIds.includes(r.id));
    const after = newRows.slice(insertAt).filter(r => !draggingIds.includes(r.id));
    const combined = [...before, ...newItems, ...after];
    combined.forEach((r, i) => r.order = i);

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
    setSelectedRowIds(new Set(draggingIds));
  };

  const goPrev = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const goNext = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  const monthName = new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    const isInEditable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && !(t as HTMLInputElement).readOnly;
    };
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedRowIds(new Set()); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        if (isInEditable(e.target)) return;
        const ids = boneyardFlatRef.current;
        if (ids.length > 0) {
          e.preventDefault();
          setSelectedRowIds(new Set(ids));
          setLastClickedId(ids[0]);
          scrollToRow(ids[0]);
        }
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (isInEditable(e.target)) return;
      const flat = boneyardFlatRef.current;
      if (flat.length === 0) return;
      e.preventDefault();
      const isShift = e.shiftKey;
      const isDown = e.key === 'ArrowDown';
      const currentIds = Array.from(selectedRowIdsRef.current).filter(id => flat.includes(id));
      const anchor = lastClickedIdRef.current;
      if (isShift) {
        const anchorIdx = anchor ? flat.indexOf(anchor) : -1;
        if (anchorIdx === -1) {
          setSelectedRowIds(new Set([flat[0]]));
          setLastClickedId(flat[0]);
          scrollToRow(flat[0]);
          return;
        }
        const indices = currentIds.map(id => flat.indexOf(id)).filter(i => i >= 0);
        let from: number, to: number;
        if (indices.length === 0) {
          from = anchorIdx;
          to = isDown ? Math.min(anchorIdx + 1, flat.length - 1) : Math.max(anchorIdx - 1, 0);
        } else {
          const minIdx = Math.min(...indices);
          const maxIdx = Math.max(...indices);
          if (isDown) {
            if (minIdx < anchorIdx) { from = minIdx + 1; to = maxIdx; }
            else { from = anchorIdx; to = Math.min(maxIdx + 1, flat.length - 1); }
          } else {
            if (maxIdx > anchorIdx) { from = minIdx; to = maxIdx - 1; }
            else { from = Math.max(minIdx - 1, 0); to = anchorIdx; }
          }
        }
        setSelectedRowIds(new Set(flat.slice(from, to + 1)));
        scrollToRow(flat[isDown ? to : from]);
      } else {
        if (currentIds.length === 0) {
          setSelectedRowIds(new Set([flat[0]]));
          setLastClickedId(flat[0]);
          scrollToRow(flat[0]);
          return;
        }
        const refId = anchor && currentIds.includes(anchor) ? anchor : (isDown ? currentIds[currentIds.length - 1] : currentIds[0]);
        const idx = flat.indexOf(refId);
        if (isDown && idx < flat.length - 1) {
          setSelectedRowIds(new Set([flat[idx + 1]]));
          setLastClickedId(flat[idx + 1]);
          scrollToRow(flat[idx + 1]);
        } else if (!isDown && idx > 0) {
          setSelectedRowIds(new Set([flat[idx - 1]]));
          setLastClickedId(flat[idx - 1]);
          scrollToRow(flat[idx - 1]);
        }
      }
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [currentWindow, scrollToRow, setSelectedRowIds, setLastClickedId]);

  useEffect(() => {
    const isInEditable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      return (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && !(t as HTMLInputElement).readOnly;
    };
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'x' || e.key === 'X')) {
        if (isInEditable(e.target)) return;
        e.preventDefault();
        cutSelected();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
        if (isInEditable(e.target)) return;
        e.preventDefault();
        if (selectedRowIdsRef.current.size === 1) {
          pasteClipboard([...selectedRowIdsRef.current][0] as string);
        }
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedRowIdsRef.current.size > 0) {
        if (isInEditable(e.target)) return;
        if (!activeVersion) return;
        e.preventDefault();
        const ids = Array.from(selectedRowIdsRef.current).filter((id): id is string => {
          const r = activeVersion.rows.find(rr => rr.id === id);
          return !r?.pinned;
        });
        if (ids.length === 0) return;
        const allRows = [...activeVersion.rows];
        const allInBoneyard = ids.every(id => {
          const r = allRows.find(rr => rr.id === id);
          return r && r.containerId == null;
        });
        if (allInBoneyard && ids.some(id => {
          const r = allRows.find(rr => rr.id === id);
          return r && r.type !== 'DAYBREAK';
        })) {
          const containerRows = allRows.filter(r => r.containerId != null && r.containerId !== -1);
          const maxOrder = containerRows.length > 0 ? Math.max(...containerRows.map(r => r.order)) : -1;
          const newRows = allRows.map(r => {
            if (ids.includes(r.id) && r.type !== 'DAYBREAK') {
              return { ...r, containerId: 1, order: maxOrder + 1 + ids.indexOf(r.id) };
            }
            if (ids.includes(r.id) && r.type === 'DAYBREAK') {
              return null;
            }
            return r;
          }).filter(Boolean) as ScheduleRow[];
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
        } else {
          const hasDaybreak = ids.some(id => {
            const r = allRows.find(rr => rr.id === id);
            return r && r.type === 'DAYBREAK';
          });
          const newRows = hasDaybreak
            ? allRows.filter(r => !(ids.includes(r.id) && r.type === 'DAYBREAK')).map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r)
            : allRows.map(r => ids.includes(r.id) ? { ...r, containerId: null, order: 999999 } : r);
          dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: newRows } });
        }
        selectNextAfterRemove(new Set(ids as string[]));
        return;
      }
      if (e.key === 'Enter' && selectedRowIdsRef.current.size === 1) {
        if (isInEditable(e.target)) return;
        const selectedId = [...selectedRowIdsRef.current][0] as string;
        const selectedRow = activeVersion?.rows.find(r => r.id === selectedId);
        if (selectedRow?.type === 'SCENE' && selectedRow.sceneId) {
          e.preventDefault();
          if (!IS_COARSE && e.shiftKey && onOpenSceneInPopout) {
            onOpenSceneInPopout(selectedRow.sceneId);
          } else {
            onOpenScene?.(selectedRow.sceneId);
          }
        } else if (selectedRow?.type === 'NOTE') {
          e.preventDefault();
          setColorPicker({ rowId: selectedRow.id, bg: selectedRow.noteColor || '#591b1b', text: selectedRow.noteTextColor || '#ffffff', noteText: selectedRow.noteText || '', originalBg: selectedRow.noteColor || '#591b1b', originalText: selectedRow.noteTextColor || '#ffffff', originalNoteText: selectedRow.noteText || '' });
        }
        return;
      }
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [currentWindow, activeVersion, dispatch, cutSelected, pasteClipboard, selectNextAfterRemove, setColorPicker, onOpenScene, onOpenSceneInPopout]);

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <>
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, sans-serif', fontSize: '11px' }}
        onClick={(e) => {
          if (marqueeJustEndedRef.current) { marqueeJustEndedRef.current = false; return; }
          if ((e.target as HTMLElement).closest('[data-row-id], button, input, select, [role="button"], [role="menuitem"]')) return;
          setSelectedRowIds(new Set());
          setViewMenuOpen(false);
          setContextMenuDate(null);
          setContextMenu(null);
        }}
      >
        <BoneyardSidebar rows={boneyardRows} scenes={project.scenes} displayField={displayField} sceneViolationMap={sceneViolationMap} activeDragRows={activeDragRows} insertBeforeId={insertBeforeId} activeRowId={activeId} activeDragIds={activeDragIds} selectedIds={selectedRowIds} onRowClick={handleRowClick} onSort={handleCalSort} onCustomSort={handleCustomSort} sortBy={calSortBy} sortDir={calSortDir} lockedCriteria={lockedCriteria} onToggleLock={handleToggleLock} sortCategories={sortCategoryEntries} intExtSortLabel={intExtSortLabel} dayNightSortLabel={dayNightSortLabel} onRowDoubleClick={handleRowDoubleClick} onRowContextMenu={handleRowContextMenu} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <PageToolbar theme="light" justify="between"
            children={
              <div className="flex items-center gap-3">
                <button onClick={goPrev} className="p-1 hover:bg-zinc-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
                <h2 className="font-semibold text-sm">{monthName}</h2>
                <button onClick={goNext} className="p-1 hover:bg-zinc-100 rounded"><ChevronRight className="w-4 h-4" /></button>
                <span className="text-zinc-400">|</span>
                <span className="text-[10px] font-semibold text-zinc-500">START</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => updateStartDate(e.target.value)}
                  className="text-[10px] font-semibold px-2 py-1 rounded border border-zinc-300 bg-white cursor-pointer"
                />
              </div>
            }
            rightContent={
              <div className="flex items-center gap-3">
                <button
                  onClick={openAutoDayOff}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Days Off
                </button>
                <DropdownMenu
                  open={viewMenuOpen}
                  onOpenChange={setViewMenuOpen}
                  width="w-48"
                  theme="light"
                  trigger={
                    <button className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600">
                      View
                      <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
                    </button>
                  }
                >
                  <DropdownSubmenu id="display-field" label="Display Field" side="left" width="w-44" icon={<AlignLeft className="w-3.5 h-3.5" />}>
                    {availableFields.map(f => {
                      const Icon = f.key === 'description' ? AlignLeft : CAT_ICONS[f.key] || getCustomIcon((project.customCategories || []).find(c => c.key === f.key)?.icon || 'Tag');
                      return (
                        <DropdownItem
                          key={f.key}
                          onClick={() => { updateCal({ displayField: f.key }); setViewMenuOpen(false); }}
                          icon={Icon ? <Icon className="w-3.5 h-3.5" /> : undefined}
                        >
                          <span className="flex-1">{f.label}</span>
                          {displayField === f.key && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </DropdownItem>
                      );
                    })}
                  </DropdownSubmenu>
                  <DropdownDivider />
                  <button
                    onClick={() => updateCal({ showBreaks: !showBreaks })}
                    className="w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 text-xs transition-colors outline-none cursor-pointer select-none text-zinc-700 hover:bg-zinc-100"
                  >
                    <span className="flex items-center gap-2">
                      <StickyNote className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      Breaks &amp; Notes
                    </span>
                    {showBreaks ? <Eye className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  </button>
                  <button
                    onClick={() => updateCal({ showConflicts: !showConflicts })}
                    className="w-full text-left px-3 py-2 rounded flex items-center justify-between gap-2 text-xs transition-colors outline-none cursor-pointer select-none text-zinc-700 hover:bg-zinc-100"
                  >
                    <span className="flex items-center gap-2">
                      <Flag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      Conflicts
                    </span>
                    {showConflicts ? <Eye className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  </button>
                </DropdownMenu>
              </div>
            }
          />
          <PageToolbar theme="light" justify="start">
            {[
              { key: null, label: <Pointer className="w-3 h-3" />, title: 'Select' },
              { key: 'work', label: 'W', title: 'Work' },
              { key: 'hold', label: 'H', title: 'Hold' },
              { key: 'travel', label: 'T', title: 'Travel' },
              { key: 'holiday', label: 'DO', title: 'Day Off' },
              { key: 'remove', label: <Eraser className="w-3 h-3" />, title: 'Erase' },
            ].map(t => (
              <button key={t.key || 'none'} type="button"
                onClick={() => setActiveTool(prev => prev === t.key ? null : t.key)}
                title={t.title}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${activeTool === t.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
              >{t.label}</button>
            ))}
          </PageToolbar>
          <div ref={calendarGridRef} onClick={(e) => {
            if (marqueeJustEndedRef.current || (e.target as HTMLElement).closest('[data-row-id]')) return;
            setSelectedRowIds(new Set());
            setViewMenuOpen(false);
            setContextMenuDate(null);
            setContextMenu(null);
          }} className="flex-1 overflow-y-auto min-h-0 relative" style={{ touchAction: IS_COARSE ? 'pan-y pan-x' : undefined }}>
            <div className="grid grid-cols-7 sticky top-0 z-10 border-l border-t border-zinc-200 bg-zinc-50">
              {DAY_NAMES.map(n => <div key={n} className="text-center text-[10px] font-semibold text-zinc-500 py-1.5 border-r border-b border-zinc-200 bg-zinc-50">{n}</div>)}
            </div>
            <MarqueeOverlay box={marqueeBox} />
            <div className="grid grid-cols-7 border-l border-zinc-200">
               {days.map((day, idx) => {
                const prev = idx > 0 ? days[idx - 1] : null;
                const firstOfCurrentMonth = day.isCurrentMonth && (!prev || !prev.isCurrentMonth);
                const firstOfNextMonth = !day.isCurrentMonth && prev?.isCurrentMonth;
                const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
                const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
                const monthSeparator = firstOfCurrentMonth
                  ? new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })
                  : firstOfNextMonth
                  ? new Date(nextYear, nextMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })
                  : null;
                const dateSectionIdx = dateSectionMap.get(day.dateKey) ?? null;
                const chronoDay = dateSectionIdx != null ? chronoDayMap.get(dateSectionIdx) : undefined;
                const sectionLabel = chronoDay ? `DAY ${chronoDay}` : undefined;
                  return (
                  <DayCell key={day.dateKey}
                    dateKey={day.dateKey} date={day.date}
                    isCurrentMonth={day.isCurrentMonth} isToday={day.isToday}
                    nonShootStatus={nonShootDateMap.get(day.dateKey)}
                    sectionIndex={dateSectionIdx ?? undefined}
                    sectionLabel={sectionLabel}
                    monthSeparator={monthSeparator}
                    activeTool={activeTool}
                    onContextMenu={(e, dateKey) => {
                      setContextMenuDate(dateKey);
                      setContextMenu({ x: e.clientX, y: e.clientY, rowId: '', containerId: null });
                    }}
                    label={workingLabels.get(day.dateKey) ?? null}
                    rows={rowsByDate.get(day.dateKey) || []} scenes={project.scenes}
                    displayField={displayField}
                    violations={violationMap.get(day.dateKey) || []}
                    sceneViolationMap={sceneViolationMap}
                    onToggle={handleToggle}
                    selectedIds={selectedRowIds}
                    activeDragIds={activeDragIds}
                    onRowClick={handleRowClick}
                    insertBeforeId={insertBeforeId}
                    activeDragRow={activeDragRow}
                    activeDragRows={activeDragRows}
                    activeRowId={activeId}
                    activeDragDay={activeDragDay}
                    onRowDoubleClick={handleRowDoubleClick}
                    onRowContextMenu={handleRowContextMenu}
                    palette={project.colorPalette}
                  />
                );
              })}
              </div>
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
        {activeType === 'DAY' && activeDragDay != null ? (
          <div className="bg-zinc-900 text-white rounded px-3 py-2 shadow-xl opacity-90">
            <div className="text-[11px] font-bold uppercase tracking-wider">{sections[activeDragDay] ? `DAY ${(chronoDayMap.get(activeDragDay) ?? 0)}` : ''}</div>
            <div className="text-[9px] text-zinc-400">{sections[activeDragDay]?.rows.length ?? 0} strips</div>
          </div>
        ) : null}
        {activeDragRows.length > 0 ? (
          <div className="flex flex-col gap-0.5 opacity-90">
            {activeDragRows.slice(0, 3).map(r => (
              <SceneCardContent key={r.id} row={r} scene={project.scenes.find(s => s.id === r.sceneId)} displayField={displayField} />
            ))}
            {activeDragRows.length > 3 && <div className="text-[9px] text-center text-zinc-500">+{activeDragRows.length - 3} more</div>}
          </div>
        ) : null}
      </DragOverlay>

      {contextMenuDate && contextMenu && (
        <ContextMenu open={true} x={contextMenu.x} y={contextMenu.y} onClose={() => { setContextMenu(null); setContextMenuDate(null); }}>
          <ContextMenuItem onClick={() => { handleNonShootToggle(contextMenuDate, 'hold'); setContextMenu(null); setContextMenuDate(null); }} icon={<Pause className="w-3.5 h-3.5" />}>Hold</ContextMenuItem>
          <ContextMenuItem onClick={() => { handleNonShootToggle(contextMenuDate, 'travel'); setContextMenu(null); setContextMenuDate(null); }} icon={<Plane className="w-3.5 h-3.5" />}>Travel</ContextMenuItem>
          <ContextMenuItem onClick={() => { handleNonShootToggle(contextMenuDate, 'holiday'); setContextMenu(null); setContextMenuDate(null); }} icon={<Sun className="w-3.5 h-3.5" />}>Day Off</ContextMenuItem>
          {nonShootDateMap.has(contextMenuDate) && (
            <>
              <ContextMenuDivider />
              <ContextMenuItem onClick={() => { handleNonShootToggle(contextMenuDate, null); setContextMenu(null); setContextMenuDate(null); }} icon={<X className="w-3.5 h-3.5" />}>Clear Status</ContextMenuItem>
            </>
          )}
        </ContextMenu>
      )}
      {contextMenu && !contextMenuDate && (
        <StripboardContextMenuContent
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          rows={(activeVersion?.rows || [])}
          selectedRowIds={selectedRowIds}
          inClipboard={inClipboard}
          cutSelected={cutSelected}
          pasteClipboard={pasteClipboard}
          handleContextMenuAction={handleContextMenuAction}
          dispatch={dispatch}
          activeVersion={activeVersion}
          selectNextAfterRemove={selectNextAfterRemove}
          containerRef={calendarGridRef}
          onOpenScene={onOpenScene}
          onOpenSceneInPopout={onOpenSceneInPopout}
          shiftHeld={shiftHeld}
        />
      )}
      {colorPicker && (
        <Modal open onClose={() => setColorPicker(null)} title="Edit Banner" width="max-w-md"
          footer={
            <ModalFooter>
              <button onClick={() => setColorPicker(null)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={applyNoteColor} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Apply</button>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Background</span>
              <div className="flex items-center gap-2.5">
                <input type="color" value={colorPicker.bg} onChange={e => setColorPicker(p => p ? { ...p, bg: e.target.value } : null)} className="w-9 h-9 rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0" />
                <input type="text" readOnly value={colorPicker.bg} className="w-[5.5rem] text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none select-all" />
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-zinc-300">Text Color</span>
              <div className="flex items-center gap-2.5">
                <input type="color" value={colorPicker.text} onChange={e => setColorPicker(p => p ? { ...p, text: e.target.value } : null)} className="w-9 h-9 rounded border border-zinc-600 bg-zinc-900 cursor-pointer p-0" />
                <input type="text" readOnly value={colorPicker.text} className="w-[5.5rem] text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-700 rounded px-2 py-1 outline-none select-all" />
              </div>
            </div>
            <div>
              <textarea
                value={colorPicker.noteText}
                onChange={e => setColorPicker(p => p ? { ...p, noteText: e.target.value.toUpperCase() } : null)}
                rows={3}
                className="w-full text-xs px-3 py-2 rounded border border-zinc-800 outline-none focus:border-zinc-600 resize-none"
                style={{ background: colorPicker.bg, color: colorPicker.text }}
                placeholder="Banner text..."
              />
            </div>
          </div>
        </Modal>
      )}
      {autoDayOffOpen && (
        <Modal open onClose={() => setAutoDayOffOpen(false)} title="Auto Day Off" width="max-w-sm"
          footer={
            <ModalFooter>
              <button onClick={() => setAutoDayOffOpen(false)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
              <button onClick={handleApplyAutoDaysOff} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Apply</button>
            </ModalFooter>
          }
        >
          <div className="p-6 space-y-5">
            <div>
              <span className="text-xs text-zinc-300">Days of the week</span>
              <div className="flex gap-1.5 mt-2">
                {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setAutoDayOffDays(prev => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      return next;
                    })}
                    className={`w-9 h-8 text-[10px] font-semibold rounded transition-colors ${
                      autoDayOffDays.has(i)
                        ? 'bg-zinc-700 text-white'
                        : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 border border-zinc-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
      <CustomOrderSortModal
        open={customOrderModal?.open ?? false}
        onClose={closeCustomOrderModal}
        title={customOrderModal?.title ?? ''}
        options={customOrderModal?.options ?? []}
        onSort={(order) => {
          if (customOrderModal?.criterion) handleCustomOrderSort(customOrderModal.criterion, order);
        }}
      />
    </DndContext>
    </>
  );
};