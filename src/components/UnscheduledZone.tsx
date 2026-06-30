import React from 'react';
import { ScheduleRow, Scene, ShootDayMeta, RibbonDesign } from '../types';
import { CellBorders } from '../lib/persist';
import { SortableRow } from './SortableRow';

interface UnscheduledZoneProps {
  rows: ScheduleRow[];
  scenes: Scene[];
  textEditingEnabled: boolean;
  selectedIds?: Set<string>;
  activeDragIds?: Set<string>;
  onRowClick?: (id: string, e: React.MouseEvent) => void;
  onSelectionChange?: (ids: Set<string>, addMode: boolean) => void;
  insertBeforeId?: string | null;
  activeDragRow?: ScheduleRow | null;
  activeDragRows?: ScheduleRow[];
  activeRowId?: string | null;
  onRowNavigate?: (rowId: string) => void;
  onRowDoubleClick?: (rowId: string) => void;
  ribbon?: RibbonDesign | null;
  colWidths?: number[];
  cellPaddingV?: number;
  cellPaddingH?: number;
  edgePadding?: number;
  cellBorders?: CellBorders;
}

const UnscheduledZone: React.FC<UnscheduledZoneProps> = ({
  rows, scenes, textEditingEnabled, selectedIds, activeDragIds,
  onRowClick, onSelectionChange, insertBeforeId, activeDragRow,
  activeDragRows, activeRowId, onRowNavigate, onRowDoubleClick,
  ribbon, colWidths, cellPaddingV, cellPaddingH, edgePadding, cellBorders,
}) => {
  if (rows.length === 0) return null;

  return (
    <div id="unscheduled_rows_container" className="border-t-2 border-dashed border-zinc-700 mt-2 pt-2">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1 px-3">
        Unscheduled ({rows.length})
      </div>
      {rows.map(row => (
        <SortableRow
          key={row.id}
          row={row}
          scenes={scenes}
          isSelected={selectedIds?.has(row.id) ?? false}
          isFaded={false}
          isCompact={true}
          textEditingEnabled={textEditingEnabled}
          onRowNavigate={onRowNavigate}
          ribbon={undefined}
          colWidths={colWidths}
          cellPaddingV={cellPaddingV}
          cellPaddingH={cellPaddingH}
          edgePadding={edgePadding}
          cellBorders={cellBorders}
        />
      ))}
    </div>
  );
};

export default UnscheduledZone;
