import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Scene, ScheduleRow, RibbonRow } from '../types';
import { CellBorders } from '../lib/persist';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableRibbon } from './SortableRibbon';
import { StackedGhosts } from './StripBlock';
import { useProject, useIsCloudProject } from '../store';
import { generateUUID } from '../lib/utils';
import { StickyNote, Coffee } from 'lucide-react';
import { useMarquee, MarqueeOverlay } from '../lib/useMarquee';
import { IS_COARSE } from '../lib/device';
import { useCurrentDocument } from '../lib/popoutTarget';
import { BoneyardPanel } from './BoneyardPanel';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../lib/categories';
import SortDropdown from './SortDropdown';
import { compareByCustomOrder, getLockedTiebreakerResult } from './SortDropdown';
import { useBoneyardSort } from './schedule/useBoneyardSort';
import { CustomOrderSortModal } from './CustomOrderSortModal';

const SIDEBAR_KEY = 'lemon_schedule_sidebar_width';
export const COLLAPSED_KEY = 'lemon_schedule_sidebar_collapsed';

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
  if (a.collapsed !== b.collapsed) return false;
  return true;
};

export const BoneyardBlock: React.FC<{ 
  rows: ScheduleRow[], 
  projectScenes: Scene[],
  textEditingEnabled: boolean,
  editingTarget?: { rowId: string; fieldKey: string | null } | null,
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
  collapsed: boolean,
  ribbon?: RibbonRow[],
  colWidths?: number[],
  cellPaddingV?: number,
  cellPaddingH?: number,
  edgePadding?: number,
  cellBorders?: CellBorders,
  forceExpanded?: boolean,
}> = React.memo(({ rows, projectScenes, textEditingEnabled, editingTarget, selectedIds, activeDragIds, onRowClick, onSelectionChange, onRowDoubleClick, insertBeforeId, activeDragRow, activeDragRows = [], activeRowId, onRowNavigate, onCollapseChange, collapsed, ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders, forceExpanded }) => {
  const { state, dispatch } = useProject();
  const isCloud = useIsCloudProject();
  const currentDocument = useCurrentDocument();
  const [showSortMenu, setShowSortMenu] = useState(false);

  useEffect(() => {
    if (forceExpanded && collapsed) {
      onCollapseChange?.(false);
    }
  }, [forceExpanded, collapsed, onCollapseChange]);

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

  const boneyardMarqueeRef = useRef<HTMLDivElement>(null);
  const showGhosts = activeRowId && activeDragRows.length > 0;
  const sortableRowsKey = useMemo(() => rows.map(r => r.id).join('|'), [rows]);
  const sortableItems = useMemo(() => rows.map(r => r.id), [sortableRowsKey]);

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

  const {
    sortBy, sortDir, lockedCriteria, sortCategories, intExtSortLabel, dayNightSortLabel,
    handleToggleLock, handleSort, handleCustomSort, handleCustomOrderSort,
    customOrderModal, closeCustomOrderModal,
  } = useBoneyardSort(state.present, dispatch);

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

  return (
    <BoneyardPanel
      collapsed={collapsed}
      onToggleCollapsed={() => onCollapseChange?.(!collapsed)}
      widthKey={SIDEBAR_KEY}
      defaultWidth={340}
      minWidth={200}
      maxWidth={600}
      tone="white"
      className="z-20 print:hidden"
      hideCollapseButton
      titleSlot={
        <SortDropdown
          open={showSortMenu}
          onOpenChange={setShowSortMenu}
          sortBy={sortBy}
          sortDir={sortDir}
          lockedCriteria={lockedCriteria}
          onToggleLock={handleToggleLock}
          onSort={handleSort}
          onCustomSort={handleCustomSort}
          categories={sortCategories}
          intExtLabel={intExtSortLabel}
          dayNightLabel={dayNightSortLabel}
          compact
        />
      }
      headerSlot={
        <>
          <button onClick={() => addRow('NOTE')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`} title="Add Note Ribbon">
            <StickyNote className="w-3.5 h-3.5 shrink-0" />
            Note
          </button>
          <button onClick={() => addRow('BREAK')} className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer select-none ${isCloud ? 'bg-blue-950 hover:bg-blue-900 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'}`} title="Add Break Ribbon">
            <Coffee className="w-3.5 h-3.5 shrink-0" />
            Break
          </button>
        </>
      }
    >
      <div ref={boneyardMarqueeRef} data-marquee-container className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0 bg-white items-stretch relative" style={{ touchAction: IS_COARSE ? 'pan-y pan-x' : undefined }}>
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
                  scene={r.type === 'SCENE' ? (projectScenes.find(s => s.id === r.sceneId) ?? null) : null}
                  isCompact
                  isSelected={selectedIds?.has(r.id) ?? false}
                  isFaded={activeDragIds?.has(r.id) ?? false}
                  onSelectToggle={onRowClick ? (e) => onRowClick(r.id, e) : undefined}
                  isEditable={r.id === editingTarget?.rowId}
                  focusField={r.id === editingTarget?.rowId ? editingTarget.fieldKey : null}
                  onDoubleClick={onRowDoubleClick}
                  onRowNavigate={onRowNavigate}
                  ribbon={ribbon}
                  colWidths={colWidths}
                  cellPaddingV={cellPaddingV} cellPaddingH={cellPaddingH}
                  edgePadding={edgePadding}
                  cellBorders={cellBorders}
                  dispatch={dispatch}
                  activeVersionId={state.present.activeVersionId}
                  palette={state.present.colorPalette}
                  castMembers={state.present.castMembers || []}
                  breakdownElements={state.present.breakdownElements}
                  customCategories={state.present.customCategories}
                  hiddenCategories={state.present.hiddenCategories}
                  elementLinks={state.present.elementLinks}
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
      <CustomOrderSortModal
        open={customOrderModal?.open ?? false}
        onClose={closeCustomOrderModal}
        title={customOrderModal?.title ?? ''}
        options={customOrderModal?.options ?? []}
        onSort={(order) => {
          if (customOrderModal?.criterion) handleCustomOrderSort(customOrderModal.criterion, order);
        }}
      />
    </BoneyardPanel>
  );
}, boneyardBlockPropsEqual);
