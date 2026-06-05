import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Scene, ScheduleRow } from '../types';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableRow } from './SortableRow';
import { StackedGhosts } from './DayBlock';
import { useProject } from '../store';
import { generateUUID } from '../lib/utils';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMarquee, MarqueeOverlay } from '../lib/useMarquee';

const SIDEBAR_KEY = 'lemon_schedule_sidebar_width';
const COLLAPSED_KEY = 'lemon_schedule_sidebar_collapsed';

export const UnscheduledBlock: React.FC<{ 
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
  insertBeforeId?: string | null,
  activeDragRow?: ScheduleRow | null,
  activeDragRows?: ScheduleRow[],
  activeRowId?: string | null,
  onRowNavigate?: (rowId: string) => void,
  onCollapseChange?: (collapsed: boolean) => void,
}> = ({ rows, projectScenes, textEditingEnabled, selectedIds, activeDragIds, onRowClick, onSelectionChange, insertBeforeId, activeDragRow, activeDragRows = [], activeRowId, onRowNavigate, onCollapseChange }) => {
  const { state, dispatch } = useProject();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const [showSortMenu, setShowSortMenu] = useState(false);
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
    if (textEditingEnabled) return;
    const onSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (target.isContentEditable) return;
      e.preventDefault();
    };
    document.addEventListener('selectstart', onSelectStart);
    return () => document.removeEventListener('selectstart', onSelectStart);
  }, [textEditingEnabled]);

  const panelRef = useRef<HTMLDivElement>(null);
  const unscheduledMarqueeRef = useRef<HTMLDivElement>(null);
  const showGhosts = activeRowId && activeDragRows.length > 0;

  const { marqueeBox } = useMarquee(
    unscheduledMarqueeRef,
    useCallback((ids, isAddMode) => {
      onSelectionChange?.(ids, isAddMode);
    }, [onSelectionChange]),
    !textEditingEnabled,
  );
  
  const { setNodeRef } = useDroppable({
    id: 'unscheduled_bin',
    data: { type: 'UNSCHEDULED_BIN' }
  });

  const { setNodeRef: setEndRef } = useDroppable({
    id: 'end-unscheduled',
    data: { type: 'UNSCHEDULED_END' }
  });

  const addRow = (type: 'NOTE' | 'BREAK') => {
    const activeVersion = state.present.versions.find(v => v.id === state.present.activeVersionId);
    if (!activeVersion) return;
    const newOrder = rows.length > 0 ? Math.max(...rows.map(r => r.order)) + 1 : 0;
    
    const newRow: ScheduleRow = type === 'NOTE' ? {
      id: generateUUID(),
      type: 'NOTE',
      shootDay: null,
      order: newOrder,
      noteText: ''
    } : {
      id: generateUUID(),
      type: 'BREAK',
      shootDay: null,
      order: newOrder,
      breakLabel: 'LUNCH',
      breakDuration: 60
    };

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: [...activeVersion.rows, newRow] } });
  };

  const sortUnscheduled = (criterion: 'scene_number' | 'script_day' | 'page_count' | 'set_name') => {
    const activeVersion = state.present.versions.find(v => v.id === state.present.activeVersionId);
    if (!activeVersion) return;

    const scheduled = activeVersion.rows.filter(r => r.shootDay !== null);

    const sceneIdsInRows = new Set(activeVersion.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
    const missingScenes = state.present.scenes.filter(s => !sceneIdsInRows.has(s.id));
    
    const unscheduled: ScheduleRow[] = [
      ...activeVersion.rows.filter(r => r.shootDay === null),
      ...missingScenes.map(s => ({
        id: generateUUID(),
        type: 'SCENE' as const,
        sceneId: s.id,
        shootDay: null,
        order: 999999,
        estimatedDuration: 30
      }))
    ];

    unscheduled.sort((a, b) => {
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
      } else if (criterion === 'set_name') {
        return sceneA.set.localeCompare(sceneB.set);
      }
      return 0;
    });

    const combined = [...scheduled, ...unscheduled];
    combined.forEach((r, i) => {
      r.order = i;
    });

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: combined } });
  };

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth || widthRef.current;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(600, Math.max(200, startWidth + e.clientX - startX));
      widthRef.current = newWidth;
      if (panelRef.current) {
        panelRef.current.style.width = `${newWidth}px`;
      }
    };
    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth(widthRef.current);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div 
      ref={(node: HTMLDivElement | null) => {
        panelRef.current = node;
        if (isCollapsed && setNodeRef) setNodeRef(node);
      }}
      className={`${isCollapsed ? 'w-[44px] bg-zinc-50' : 'bg-white'} border-[2px] border-black shadow-xl flex flex-col z-20 print:hidden relative shrink-0 overflow-hidden`}
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
              UNSCHEDULED ({rows.length})
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full" style={{ width: '100%' }}>
          <div className="p-4 border-b border-zinc-200 bg-zinc-50 shadow-sm sticky top-0 z-10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-sm tracking-widest text-zinc-800">UNSCHEDULED</h2>
                <p className="text-xs text-zinc-500 mt-1">{rows.length} Items</p>
              </div>
              
              <div className="flex items-center space-x-1">
                {/* Sort Dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => setShowSortMenu(p => !p)}
                    className="px-2.5 py-1 text-xs font-bold bg-white border border-zinc-300 hover:bg-zinc-100 hover:text-black text-zinc-600 rounded shadow-sm flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    Sort ▾
                  </button>
                  
                  {showSortMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                      <div className="absolute right-0 top-full mt-1.5 w-48 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-50 text-zinc-300 p-1 flex flex-col text-[11px] font-sans font-semibold">
                        <button 
                          onClick={() => { sortUnscheduled('scene_number'); setShowSortMenu(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-zinc-900 rounded hover:text-white transition-colors cursor-pointer"
                        >
                          Sort by Scene Number
                        </button>
                        <button 
                          onClick={() => { sortUnscheduled('script_day'); setShowSortMenu(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-zinc-900 rounded hover:text-white transition-colors cursor-pointer"
                        >
                          Sort by Script Day
                        </button>
                        <button 
                          onClick={() => { sortUnscheduled('page_count'); setShowSortMenu(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-zinc-900 rounded hover:text-white transition-colors cursor-pointer"
                        >
                          Sort by Page Count (Longest)
                        </button>
                        <button 
                          onClick={() => { sortUnscheduled('set_name'); setShowSortMenu(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-zinc-900 rounded hover:text-white transition-colors cursor-pointer"
                        >
                          Sort by Set/Location
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <button 
                  onClick={() => { setIsCollapsed(true); onCollapseChange?.(true); }}
                  className="p-1 hover:bg-zinc-200 rounded text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => addRow('NOTE')} className="flex-1 text-xs font-bold bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-100 py-1.5 rounded flex items-center justify-center gap-1 shadow-sm cursor-pointer">
                 <Plus className="w-3 h-3" /> NOTE
              </button>
              <button onClick={() => addRow('BREAK')} className="flex-1 text-xs font-bold bg-white border border-zinc-300 text-zinc-600 hover:bg-zinc-100 py-1.5 rounded flex items-center justify-center gap-1 shadow-sm cursor-pointer">
                 <Plus className="w-3 h-3" /> BREAK
              </button>
            </div>
          </div>
          
          <div ref={unscheduledMarqueeRef} className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0 bg-white items-stretch relative">
            <MarqueeOverlay box={marqueeBox} />
            <div id="unscheduled_rows_container" ref={setNodeRef} className="flex-1 flex flex-col min-h-0 items-stretch">
            <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((r, i, arr) => (
                <React.Fragment key={r.id}>
                  {showGhosts && insertBeforeId === r.id && (
                    <StackedGhosts rows={activeDragRows} scenes={projectScenes} />
                  )}
                  <SortableRow 
                    row={r}
                    scenes={projectScenes}
                    isCompact
                    isSelected={selectedIds?.has(r.id) ?? false}
                    isFaded={activeDragIds?.has(r.id) ?? false}
                    onSelectToggle={onRowClick ? (e) => onRowClick(r.id, e) : undefined}
                    textEditingEnabled={textEditingEnabled}
                    onRowNavigate={onRowNavigate}
                  />
                </React.Fragment>
              ))}
            </SortableContext>
            {rows.length === 0 && (
              <>
                {showGhosts && insertBeforeId === `end-unscheduled` && (
                  <StackedGhosts rows={activeDragRows} scenes={projectScenes} />
                )}
                <div className="flex-1" />
              </>
            )}
            {rows.length > 0 && (
              <div ref={setEndRef}>
                {showGhosts && insertBeforeId === `end-unscheduled` && (
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
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );
};
