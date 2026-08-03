import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useProject } from '../../store';
import { ScheduleRow, Scene, RuleViolation } from '../../types';
import { useCurrentDocument } from '../../lib/popoutTarget';
import SortDropdown from '../SortDropdown';
import { ChevronLeft } from 'lucide-react';
import { SceneCard, SceneCardContent } from './SceneCard';

export const SIDEBAR_KEY = 'lemon_schedule_calendar_sidebar_width';
export const SIDEBAR_COLLAPSED_KEY = 'lemon_schedule_calendar_sidebar_collapsed';

export const BoneyardSidebar: React.FC<{
  rows: ScheduleRow[];
  scenes: Scene[];
  displayField: string;
  sceneViolationMap: Map<string, RuleViolation[]>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
}> = ({ rows, scenes, displayField, sceneViolationMap, collapsed, onToggleCollapsed, activeDragRows = [], insertBeforeId, activeRowId, activeDragIds, selectedIds, onRowClick, onSort, onCustomSort, sortBy, sortDir = 'asc' as 'asc' | 'desc', lockedCriteria = [], onToggleLock, sortCategories = [], intExtSortLabel, dayNightSortLabel, onRowDoubleClick, onRowContextMenu }) => {
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

  if (collapsed) return null;

  return (
    <div ref={panelRef}
      className="bg-zinc-50 border-r border-zinc-200 flex flex-col shrink-0 relative overflow-hidden"
      style={{ width: `${width}px` }}
    >
      <div className="px-3 pt-2 pb-1.5 border-b shrink-0 bg-zinc-50 border-zinc-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 shrink-0 select-none">Boneyard</span>
            <span className="text-zinc-300 select-none shrink-0">·</span>
            <span className="text-[10px] font-semibold text-zinc-400 shrink-0">{rows.length}</span>
          </div>
          <button
            onClick={onToggleCollapsed}
            className="p-1 -mr-1 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer shrink-0"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        {onSort && (
          <div className="flex items-center gap-2 mt-1.5">
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
      <div ref={setNodeRef} className={`flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-20 flex flex-col gap-0 ${isOver ? 'bg-blue-50' : ''}`}>
        {rows.filter(r => r.containerId == null).map(r => (
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
          </React.Fragment>
        ))}
        {rows.some(r => r.containerId != null) && (
          <div className="flex items-center gap-2 px-1 pt-3 pb-1">
            <div className="flex-1 border-t border-zinc-300" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 shrink-0 select-none">Unplaced</span>
            <div className="flex-1 border-t border-zinc-300" />
          </div>
        )}
        {rows.filter(r => r.containerId != null).map((r, i, arr) => (
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
    </div>
  );
};
