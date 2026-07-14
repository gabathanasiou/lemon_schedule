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

const SIDEBAR_KEY = 'lemon_schedule_calendar_sidebar_width';

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

const SceneCard: React.FC<{ row: ScheduleRow; scene?: Scene; displayField: string; violations?: RuleViolation[]; isSelected?: boolean; isFaded?: boolean; onToggle?: (id: string, e: React.MouseEvent) => void; onDoubleClick?: (id: string) => void }> = ({ row, scene, displayField, violations, isSelected, isFaded, onToggle, onDoubleClick }) => {
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
  palette?: SceneColorPalette;
  activeDragDay?: number | null;
}> = ({ dateKey, date, isCurrentMonth, isToday, rows, scenes, displayField, violations, sceneViolationMap, onToggle, onContextMenu, nonShootStatus, sectionIndex, sectionLabel, label, activeTool, selectedIds, activeDragIds, onRowClick, insertBeforeId, activeDragRow, activeDragRows = [], activeRowId, monthSeparator, onRowDoubleClick, palette, activeDragDay }) => {
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
              <SceneCard row={r} scene={scenes.find(s => s.id === r.sceneId)} displayField={displayField} violations={sceneViolationMap.get(r.sceneId || '')} isSelected={selectedIds?.has(r.id) ?? false} isFaded={activeDragIds?.has(r.id) ?? false} onToggle={onRowClick} onDoubleClick={onRowDoubleClick} />
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
  onSort?: (criterion: 'scene_number' | 'script_day' | 'page_count' | 'set_name') => void;
  onRowDoubleClick?: (id: string) => void;
}> = ({ rows, scenes, displayField, sceneViolationMap, activeDragRows = [], insertBeforeId, activeRowId, activeDragIds, selectedIds, onRowClick, onSort, onRowDoubleClick }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'boneyard', data: { type: 'BONEYARD' } });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [width, setWidth] = useState<number>(() => {
    try { const v = localStorage.getItem(SIDEBAR_KEY); return v ? parseInt(v, 10) : 200; } catch { return 200; }
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
      className="border-r border-zinc-200 bg-zinc-50 flex flex-col shrink-0 relative overflow-hidden"
      style={{ width: `${width}px` }}
    >
      <div className="px-3 py-2 border-b border-zinc-200 font-semibold text-[11px] text-zinc-600 bg-white flex items-center justify-between">
        <span>BONEYARD</span>
        {onSort && (
          <div className="relative">
            <button onClick={() => setShowSortMenu(p => !p)} className="text-[10px] text-zinc-400 hover:text-zinc-600 font-normal">
              Sort ▾
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-50 text-zinc-300 p-1 flex flex-col text-[10px] font-sans font-semibold">
                  <button onClick={() => { onSort('scene_number'); setShowSortMenu(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 rounded hover:text-white">Scene Number</button>
                  <button onClick={() => { onSort('script_day'); setShowSortMenu(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 rounded hover:text-white">Script Day</button>
                  <button onClick={() => { onSort('page_count'); setShowSortMenu(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 rounded hover:text-white">Page Count (Longest)</button>
                  <button onClick={() => { onSort('set_name'); setShowSortMenu(false); }} className="w-full text-left px-2 py-1.5 hover:bg-zinc-900 rounded hover:text-white">Set / Location</button>
                </div>
              </>
            )}
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
            <SceneCard row={r} scene={scenes.find(s => s.id === r.sceneId)} displayField={displayField} violations={sceneViolationMap.get(r.sceneId || '')} isSelected={selectedIds?.has(r.id) ?? false} isFaded={activeDragIds?.has(r.id) ?? false} onToggle={onRowClick} onDoubleClick={onRowDoubleClick} />
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
    </div>
  );
};

export const CalendarTab: React.FC<{ onOpenScene?: (sceneId: string) => void; onOpenSceneInPopout?: (sceneId: string) => void }> = ({ onOpenScene, onOpenSceneInPopout }) => {
  const { state, dispatch } = useProject();
  const currentWindow = useCurrentWindow();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);

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

  const containerRows = useMemo(() => {
    if (!activeVersion) return [];
    return activeVersion.rows.filter(r => r.containerId != null).sort((a, b) => {
      if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
  }, [activeVersion]);

  const sections = useMemo(() => {
    const s: { index: number; rows: ScheduleRow[]; daybreakRow?: ScheduleRow }[] = [];
    let currentRows: ScheduleRow[] = [];
    let sectionIndex = 0;
    for (const r of containerRows) {
      if (r.type === 'DAYBREAK') {
        s.push({ index: sectionIndex, rows: currentRows, daybreakRow: r });
        currentRows = [];
        sectionIndex++;
      } else {
        currentRows.push(r);
      }
    }
    return s;
  }, [containerRows]);

  const calendarSections = useMemo(() => sections.filter(s => !s.daybreakRow?.pinned), [sections]);

  const addDays = (d: string, n: number) => {
    const parts = d.split('-').map(Number);
    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + n));
    return dt.toISOString().slice(0, 10);
  };

  const nonShootDateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const ns of nonShootDates) m.set(ns.date, ns.status);
    return m;
  }, [nonShootDates]);

  const sectionDateMap = useMemo(() => {
    const m = new Map<number, string>();
    let current = startDate;
    for (const s of calendarSections) {
      while (nonShootDateMap.has(current)) current = addDays(current, 1);
      m.set(s.index, current);
      current = addDays(current, 1);
    }
    return m;
  }, [calendarSections, startDate, nonShootDateMap]);

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let chrono = 1;
    for (const s of calendarSections) {
      m.set(s.index, chrono++);
    }
    return m;
  }, [calendarSections]);

  const workingLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const workingDates = [...new Set<string>(sectionDateMap.values())].filter(d => !nonShootDateMap.has(d)).sort();
    if (workingDates.length === 0) return labels;
    labels.set(workingDates[0], 'SW');
    if (workingDates.length > 1) labels.set(workingDates[workingDates.length - 1], 'FW');
    for (let i = 1; i < workingDates.length - 1; i++) {
      labels.set(workingDates[i], 'W');
    }
    return labels;
  }, [sections, nonShootDateMap]);

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

  const sceneIdsInRows = new Set(activeVersion?.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
  const missingScenes = project.scenes.filter(s => !sceneIdsInRows.has(s.id));

  const augmentedRows = useMemo(() => [
    ...(activeVersion?.rows || []),
    ...missingScenes.map((s, i) => ({ id: `row-synth-${s.id}`, type: 'SCENE' as const, sceneId: s.id, containerId: null as number | null, order: 999999 + i, estimatedDuration: 30 })),
  ], [activeVersion?.rows, missingScenes]);

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
    selectNextAfterRemove,
  } = useStripboardContextMenu({
    selectedRowIds,
    setSelectedRowIds,
    augmentedRows,
    activeVersion,
    activeDragIds,
    textEditingEnabled: false,
    dispatch,
    setFocusedRowId,
    scrollToRow,
    setColorPicker,
    project,
  });

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    if (!activeVersion) return map;
    for (const s of sections) {
      const dateKey = sectionDateMap.get(s.index);
      if (!dateKey) continue;
      const allRows = s.rows.filter(r => {
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
    return augmentedRows.filter(r => {
      if (activeDragIds.has(r.id)) return false;
      if (!showBreaks && (r.type === 'BREAK' || r.type === 'NOTE' || r.type === 'DAYBREAK')) return false;
      if (r.containerId === null && r.type !== 'DAYBREAK') return true;
      if (r.containerId != null && !sectionRowIds.has(r.id) && r.type !== 'DAYBREAK') return true;
      return false;
    }).sort((a, b) => a.order - b.order);
  }, [augmentedRows, activeDragIds, showBreaks, sectionRowIds]);

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

  const sortBoneyard = useCallback((criterion: 'scene_number' | 'script_day' | 'page_count' | 'set_name') => {
    if (!activeVersion) return;
    const scheduled = activeVersion.rows.filter(r => r.containerId !== null);
    const sceneIdsInRows = new Set(activeVersion.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
    const missingScenes = project.scenes.filter(s => !sceneIdsInRows.has(s.id));
    const boneyard: ScheduleRow[] = [
      ...activeVersion.rows.filter(r => r.containerId === null),
      ...missingScenes.map(s => ({ id: generateUUID(), type: 'SCENE' as const, sceneId: s.id, containerId: null as number | null, order: 999999, estimatedDuration: 30 })),
    ];
    boneyard.sort((a, b) => {
      if (a.type !== 'SCENE' && b.type === 'SCENE') return 1;
      if (a.type === 'SCENE' && b.type !== 'SCENE') return -1;
      if (a.type !== 'SCENE' && b.type !== 'SCENE') return 0;
      const sA = project.scenes.find(s => s.id === a.sceneId);
      const sB = project.scenes.find(s => s.id === b.sceneId);
      if (!sA || !sB) return 0;
      if (criterion === 'scene_number') return sA.sceneNumber.localeCompare(sB.sceneNumber, undefined, { numeric: true, sensitivity: 'base' });
      if (criterion === 'script_day') return sA.scriptDay.localeCompare(sB.scriptDay, undefined, { numeric: true, sensitivity: 'base' });
      if (criterion === 'page_count') return sB.pageCountDecimal - sA.pageCountDecimal;
      if (criterion === 'set_name') return sA.set.localeCompare(sB.set);
      return 0;
    });
    const combined = [...scheduled, ...boneyard];
    combined.forEach((r, i) => { r.order = i; });
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
  }, [activeVersion, project.scenes, dispatch]);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
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
      const allIds = augmentedRows.map(r => r.id);
      const idxA = allIds.indexOf(lastClickedId);
      const idxB = allIds.indexOf(id);
      if (idxA >= 0 && idxB >= 0) setSelectedRowIds(new Set(allIds.slice(Math.min(idxA, idxB), Math.max(idxA, idxB) + 1)));
    } else {
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
            const rA = augmentedRows.find(r => r.id === a);
            const rB = augmentedRows.find(r => r.id === b);
            if (rA && rB) {
              if (rA.containerId !== rB.containerId) return (rA.containerId || 0) - (rB.containerId || 0);
              return rA.order - rB.order;
            }
            return 0;
          })
          .map(id => augmentedRows.find(r => r.id === id)!)
          .filter(Boolean)
      : [augmentedRows.find(r => r.id === activeId)!].filter(Boolean);
  }, [activeId, activeType, activeDragIds, augmentedRows]);

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
    setActiveDragRow(augmentedRows.find(r => r.id === draggedId) || null);
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

      if (sourceBlock.daybreakRow && targetBlock.daybreakRow) {
        const a = sourceBlock.daybreakRow.daybreakCallTime;
        const b = targetBlock.daybreakRow.daybreakCallTime;
        sourceBlock.daybreakRow.daybreakCallTime = b;
        targetBlock.daybreakRow.daybreakCallTime = a;
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
      const rA = augmentedRows.find(r => r.id === a);
      const rB = augmentedRows.find(r => r.id === b);
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
      const overRow = augmentedRows.find(r => r.id === over.id);
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
    const sanitizeRow = (r: ScheduleRow) => {
      if (r.id.startsWith('row-synth-')) return { ...r, id: generateUUID() };
      return r;
    };

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
      const persistentRows = newRows.map(sanitizeRow);
      dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: persistentRows } });
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

    const firstSectionRow = targetSection.rows[0];
    const firstIdx = firstSectionRow ? newRows.findIndex(r => r.id === firstSectionRow.id) : newRows.length;
    const insertAt = firstSectionRow ? firstIdx + insertIndex : newRows.length;

    const draggingItems = draggingIds
      .map(id => augmentedRows.find(r => r.id === id) || activeVersion.rows.find(r => r.id === id))
      .filter(Boolean) as ScheduleRow[];
    const newItems = draggingItems.map(item => ({ ...item, containerId: 1 }));

    const before = newRows.slice(0, insertAt).filter(r => !draggingIds.includes(r.id));
    const after = newRows.slice(insertAt).filter(r => !draggingIds.includes(r.id));
    const combined = [...before, ...newItems, ...after];
    combined.forEach((r, i) => r.order = i);

    const persistentRows = combined.map(sanitizeRow);
    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: persistentRows } });
    setSelectedRowIds(new Set(draggingIds));
  };

  const goPrev = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const goNext = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  const monthName = new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedRowIds(new Set()); };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [currentWindow]);

  if (!activeVersion) return <div className="p-8 text-zinc-500">No active version</div>;

  return (
    <>
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex overflow-hidden min-h-0" style={{ fontFamily: 'Helvetica, sans-serif', fontSize: '11px' }}>
        <BoneyardSidebar rows={boneyardRows} scenes={project.scenes} displayField={displayField} sceneViolationMap={sceneViolationMap} activeDragRows={activeDragRows} insertBeforeId={insertBeforeId} activeRowId={activeId} activeDragIds={activeDragIds} selectedIds={selectedRowIds} onRowClick={handleRowClick} onSort={sortBoneyard} onRowDoubleClick={handleRowDoubleClick} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-white">
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
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white">
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
          </div>
          <div ref={calendarGridRef} className="flex-1 overflow-y-auto min-h-0 relative" style={{ touchAction: IS_COARSE ? 'pan-y pan-x' : undefined }}>
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
          augmentedRows={augmentedRows}
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
    </DndContext>
    </>
  );
};