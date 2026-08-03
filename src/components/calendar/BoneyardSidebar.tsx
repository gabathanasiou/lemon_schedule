import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ScheduleRow, Scene, RuleViolation } from '../../types';
import SortDropdown from '../SortDropdown';
import { SceneCard, SceneCardContent } from './SceneCard';
import { BoneyardPanel } from '../BoneyardPanel';

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

  return (
    <BoneyardPanel
      count={rows.length}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      widthKey={SIDEBAR_KEY}
      defaultWidth={200}
      minWidth={160}
      maxWidth={400}
      headerSlot={onSort ? (
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
      ) : undefined}
    >
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
    </BoneyardPanel>
  );
};
