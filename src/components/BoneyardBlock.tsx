import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Scene, ScheduleRow, RibbonRow } from '../types';
import { CellBorders } from '../lib/persist';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableRibbon } from './SortableRibbon';
import { StackedGhosts } from './StripBlock';
import { useProject, useIsCloudProject } from '../store';
import { generateUUID } from '../lib/utils';
import { Plus, ChevronLeft, ChevronRight, StickyNote, Coffee, ArrowUpDown, ChevronDown } from 'lucide-react';
import { useMarquee, MarqueeOverlay } from '../lib/useMarquee';
import { IS_COARSE } from '../lib/device';
import { useCurrentDocument } from '../lib/popoutTarget';
import { ELEMENT_CATEGORIES } from '../lib/categories';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';

const SIDEBAR_KEY = 'lemon_schedule_sidebar_width';
const COLLAPSED_KEY = 'lemon_schedule_sidebar_collapsed';

const boneyardBlockPropsEqual = (a: any, b: any) => {
  if (a.rows !== b.rows) return false;
  if (a.projectScenes !== b.projectScenes) return false;
  if (a.textEditingEnabled !== b.textEditingEnabled) return false;
  if (a.selectedIds !== b.selectedIds) return false;
  if (a.activeDragIds !== b.activeDragIds) return false;
  if (a.insertBeforeId !== b.insertBeforeId) return false;
  if (a.activeDragRow !== b.activeDragRow) return false;
  if (a.activeDragRows !== b.activeDragRows) return false;
  if (a.activeRowId !== b.activeRowId) return false;
  if (a.forceExpanded !== b.forceExpanded) return false;
  if (a.ribbon !== b.ribbon || a.colWidths !== b.colWidths) return false;
  if (a.cellPaddingV !== b.cellPaddingV || a.cellPaddingH !== b.cellPaddingH) return false;
  if (a.edgePadding !== b.edgePadding || a.cellBorders !== b.cellBorders) return false;
  if (a.onRowClick !== b.onRowClick) return false;
  if (a.onSelectionChange !== b.onSelectionChange) return false;
  if (a.onRowDoubleClick !== b.onRowDoubleClick) return false;
  return true;
};

export const BoneyardBlock: React.FC<{ 
  rows: ScheduleRow[], 
  projectScenes: Scene[],
  textEditingEnabled: boolean,
  onAction?: (action: string) => void,
  contextMenu?: any,
  setContextMenu?: any,
  selectedIds?: Set<string>,
  activeDragIds?: Set<string>,
  onRowClick?: (id: string, e: React.MouseEvent) => void,
  onSelectionChange?: (ids: Set<string>, isAddMode: boolean) => void,
  onRowDoubleClick?: (id: string, shiftKey?: boolean) => void,
  insertBeforeId?: string | null,
  activeDragRow?: ScheduleRow | null,
  activeDragRows?: ScheduleRow[],
  activeRowId?: string | null,
  onRowNavigate?: (rowId: string) => void,
  onCollapseChange?: (collapsed: boolean) => void,
  ribbon?: RibbonRow[],
  colWidths?: number[],
  cellPaddingV?: number,
  cellPaddingH?: number,
  edgePadding?: number,
  cellBorders?: CellBorders,
  forceExpanded?: boolean,
}> = React.memo(({ rows, projectScenes, textEditingEnabled, selectedIds, activeDragIds, onRowClick, onSelectionChange, onRowDoubleClick, insertBeforeId, activeDragRow, activeDragRows = [], activeRowId, onRowNavigate, onCollapseChange, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders, forceExpanded }) => {
  const { state, dispatch } = useProject();
  const isCloud = useIsCloudProject();
  const currentDocument = useCurrentDocument();
  const currentDocumentRef = useRef(currentDocument);
  currentDocumentRef.current = currentDocument;
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const [showSortMenu, setShowSortMenu] = useState(false);

  const sortCategories = useMemo(() => {
    const cats = ELEMENT_CATEGORIES.map(c => ({ key: c.key, label: c.label }));
    for (const cc of state.present.customCategories) {
      cats.push({ key: cc.key, label: cc.label });
    }
    return cats;
  }, [state.present.customCategories]);
  const [width, setWidth] = useState<number>(() => {
    try { const v = localStorage.getItem(SIDEBAR_KEY); return v ? parseInt(v, 10) : 340; } catch { return 340; }
  });
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
    localStorage.setItem(SIDEBAR_KEY, String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    if (forceExpanded && isCollapsed) {
      setIsCollapsed(false);
      onCollapseChange?.(false);
    }
  }, [forceExpanded, isCollapsed, onCollapseChange]);

  useEffect(() => {
    if (textEditingEnabled) return;
    const onSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (target.isContentEditable) return;
      e.preventDefault();
    };
    currentDocument.addEventListener('selectstart', onSelectStart);
    return () => currentDocument.removeEventListener('selectstart', onSelectStart);
  }, [textEditingEnabled, currentDocument]);

  const panelRef = useRef<HTMLDivElement>(null);
  const boneyardMarqueeRef = useRef<HTMLDivElement>(null);
  const showGhosts = activeRowId && activeDragRows.length > 0;
  const sortableItems = useMemo(() => rows.map(r => r.id), [rows]);

  const { marqueeBox } = useMarquee(
    boneyardMarqueeRef,
    useCallback((ids, isAddMode) => {
      onSelectionChange?.(ids, isAddMode);
    }, [onSelectionChange]),
    !textEditingEnabled,
  );
  
  const { setNodeRef } = useDroppable({
    id: 'boneyard_bin',
    data: { type: 'BONEYARD_BIN' }
  });

  const { setNodeRef: setEndRef } = useDroppable({
    id: 'end-boneyard',
    data: { type: 'BONEYARD_END' }
  });

  const addRow = (type: 'NOTE' | 'BREAK') => {
    const activeVersion = state.present.versions.find(v => v.id === state.present.activeVersionId);
    if (!activeVersion) return;
    const newOrder = rows.length > 0 ? Math.max(...rows.map(r => r.order)) + 1 : 0;
    
    const newRow: ScheduleRow = type === 'NOTE' ? {
      id: generateUUID(),
      type: 'NOTE',
      containerId: null,
      order: newOrder,
      noteText: ''
    } : {
      id: generateUUID(),
      type: 'BREAK',
      containerId: null,
      order: newOrder,
      breakLabel: 'LUNCH',
      breakDuration: 60
    };

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: [...activeVersion.rows, newRow] } });
  };

  const sortBoneyard = (criterion: string) => {
    const activeVersion = state.present.versions.find(v => v.id === state.present.activeVersionId);
    if (!activeVersion) return;

    const scheduled = activeVersion.rows.filter(r => r.containerId !== null);

    const sceneIdsInRows = new Set(activeVersion.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
    const missingScenes = state.present.scenes.filter(s => !sceneIdsInRows.has(s.id));
    
    const boneyard: ScheduleRow[] = [
      ...activeVersion.rows.filter(r => r.containerId === null),
      ...missingScenes.map(s => ({
        id: generateUUID(),
        type: 'SCENE' as const,
        sceneId: s.id,
        containerId: null,
        order: 999999,
        estimatedDuration: 30
      }))
    ];

    boneyard.sort((a, b) => {
      if (a.type !== 'SCENE' && b.type === 'SCENE') return 1;
      if (a.type === 'SCENE' && b.type !== 'SCENE') return -1;
      if (a.type !== 'SCENE' && b.type !== 'SCENE') return 0;

      const sceneA = state.present.scenes.find(s => s.id === a.sceneId);
      const sceneB = state.present.scenes.find(s => s.id === b.sceneId);
      if (!sceneA || !sceneB) return 0;

      if (criterion === 'scene_number') {
        return sceneA.sceneNumber.localeCompare(sceneB.sceneNumber, undefined, { numeric: true, sensitivity: 'base' });
      } else if (criterion === 'script_day') {
        return sceneA.scriptDay.localeCompare(sceneB.scriptDay, undefined, { numeric: true, sensitivity: 'base' });
      } else if (criterion === 'page_count') {
        return sceneB.pageCountDecimal - sceneA.pageCountDecimal;
      } else if (criterion === 'duration') {
        return (b.estimatedDuration || 0) - (a.estimatedDuration || 0);
      } else if (criterion === 'int_ext') {
        return (sceneA.intExt || '').localeCompare(sceneB.intExt || '');
      } else if (criterion === 'day_night') {
        return (sceneA.dayNight || '').localeCompare(sceneB.dayNight || '');
      } else if (criterion === 'set_name' || criterion === 'set') {
        return sceneA.set.localeCompare(sceneB.set);
      }
      const valA = String((sceneA as any)?.[criterion] ?? '');
      const valB = String((sceneB as any)?.[criterion] ?? '');
      return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    });

    const combined = [...scheduled, ...boneyard];
    combined.forEach((r, i) => {
      r.order = i;
    });

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
  };

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth || widthRef.current;
    const handlePointerMove = (e: PointerEvent) => {
      const newWidth = Math.min(600, Math.max(200, startWidth + e.clientX - startX));
      widthRef.current = newWidth;
      if (panelRef.current) {
        panelRef.current.style.width = `${newWidth}px`;
      }
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
    <div 
      ref={(node: HTMLDivElement | null) => {
        panelRef.current = node;
        if (isCollapsed && setNodeRef) setNodeRef(node);
      }}
      className={`${isCollapsed ? 'w-[44px] bg-zinc-50' : 'bg-white'} border-r border-zinc-300 flex flex-col z-20 print:hidden relative shrink-0 overflow-hidden`}
      style={isCollapsed ? undefined : { width: `${width}px` }}
    >
      {isCollapsed ? (
        <div 
          className="flex flex-col items-center py-4 h-full cursor-pointer hover:bg-zinc-100 w-full"
          onClick={() => { setIsCollapsed(false); onCollapseChange?.(false); }}
        >
          <button 
            onClick={(e) => { e.stopPropagation(); setIsCollapsed(false); onCollapseChange?.(false); }}
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
        <div className="flex flex-col h-full" style={{ width: '100%' }}>
          <div className="px-3 pt-2 pb-2 border-b shrink-0 bg-zinc-50 border-zinc-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-zinc-800 font-bold text-sm tracking-widest shrink-0">BONEYARD</span>
                <span className="text-zinc-300 select-none shrink-0">·</span>
                <span className="text-xs text-zinc-500 shrink-0">{rows.length} Items</span>
              </div>
              <button
                onClick={() => { setIsCollapsed(true); onCollapseChange?.(true); }}
                className="p-1 hover:bg-zinc-200 rounded text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer shrink-0"
                title="Collapse Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => addRow('NOTE')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`} title="Add Note Ribbon">
                <StickyNote className="w-3.5 h-3.5 shrink-0" />
                Note
              </button>
              <button onClick={() => addRow('BREAK')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`} title="Add Break Ribbon">
                <Coffee className="w-3.5 h-3.5 shrink-0" />
                Break
              </button>
              <div className="w-px h-4 bg-zinc-200" />
              <DropdownMenu
                open={showSortMenu}
                onOpenChange={setShowSortMenu}
                width="w-56"
                theme="light"
                trigger={
                  <button className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`}>
                    <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                    Sort
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  </button>
                }
              >
                <DropdownItem onClick={() => sortBoneyard('scene_number')}>Scene Number</DropdownItem>
                <DropdownItem onClick={() => sortBoneyard('script_day')}>Script Day</DropdownItem>
                <DropdownItem onClick={() => sortBoneyard('page_count')}>Page Count</DropdownItem>
                <DropdownItem onClick={() => sortBoneyard('duration')}>Duration</DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={() => sortBoneyard('int_ext')}>INT / EXT</DropdownItem>
                <DropdownItem onClick={() => sortBoneyard('day_night')}>Day / Night</DropdownItem>
                <DropdownDivider />
                {sortCategories.map(c => (
                  <DropdownItem key={c.key} onClick={() => sortBoneyard(c.key)}>{c.label}</DropdownItem>
                ))}
              </DropdownMenu>
            </div>
          </div>
          
          <div ref={boneyardMarqueeRef} className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0 bg-white items-stretch relative" style={{ touchAction: IS_COARSE ? 'pan-y pan-x' : undefined }}>
             <MarqueeOverlay box={marqueeBox} />
            <div id="boneyard_rows_container" ref={setNodeRef} className="flex-1 flex flex-col min-h-0 items-stretch">
            <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
              {rows.map((r, i, arr) => (
                <React.Fragment key={r.id}>
                  {showGhosts && insertBeforeId === r.id && (
                    <StackedGhosts rows={activeDragRows} scenes={projectScenes} ribbon={ribbon} colWidths={colWidths} />
                  )}
                    <SortableRibbon 
                      row={r}
                      scenes={projectScenes}
                      isCompact
                      isSelected={selectedIds?.has(r.id) ?? false}
                      isFaded={activeDragIds?.has(r.id) ?? false}
                      onSelectToggle={onRowClick ? (e) => onRowClick(r.id, e) : undefined}
                      textEditingEnabled={textEditingEnabled}
                      onDoubleClick={onRowDoubleClick}
                      onRowNavigate={onRowNavigate}
                      ribbon={ribbon}
                      colWidths={colWidths}
                      cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH}
                      edgePadding={edgePadding}
                      cellBorders={cellBorders}
                    />
                </React.Fragment>
              ))}
            </SortableContext>
            {rows.length === 0 && (
              <>
                {showGhosts && insertBeforeId === `end-boneyard` && (
                  <StackedGhosts rows={activeDragRows} scenes={projectScenes} />
                )}
                <div className="flex-1" />
              </>
            )}
            {rows.length > 0 && (
              <div ref={setEndRef} className="pb-20">
                {showGhosts && insertBeforeId === `end-boneyard` && (
                  <StackedGhosts rows={activeDragRows} scenes={projectScenes} />
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      )}
      {!isCollapsed && (
        <div
          className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-blue-400/40 z-30"
          onPointerDown={handleResizeStart}
          data-no-longpress
        />
      )}
    </div>
  );
}, boneyardBlockPropsEqual);
