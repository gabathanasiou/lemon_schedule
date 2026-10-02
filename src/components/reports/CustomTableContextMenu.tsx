import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Combine, CopyPlus, Eraser, Trash2, Ungroup } from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../ContextMenu';
import { MergeRect } from '../../lib/reportTableMerges';

// Free-table cell context menu (roadmap 189) — the power path. Canonical kit
// ContextMenu (dark, press-point anchored), mirroring the ribbon designer's
// menu; distinct from the legacy block-level ReportContextMenu. Items are
// pre-disabled by the caller (the ops module decides availability).

export interface CustomTableMenuState { x: number; y: number; }

interface CustomTableContextMenuProps {
  menu: CustomTableMenuState | null;
  rect: MergeRect | null;
  canMerge: boolean;
  canUnmerge: boolean;
  canDeleteRows: boolean;
  canDeleteColumns: boolean;
  onClose: () => void;
  onMerge: () => void;
  onUnmerge: () => void;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onDuplicateRow: () => void;
  onDeleteRows: () => void;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onDuplicateColumn: () => void;
  onDeleteColumns: () => void;
  onClear: () => void;
}

const CustomTableContextMenu: React.FC<CustomTableContextMenuProps> = ({
  menu, rect, canMerge, canUnmerge, canDeleteRows, canDeleteColumns,
  onClose, onMerge, onUnmerge, onInsertRowAbove, onInsertRowBelow, onDuplicateRow, onDeleteRows,
  onInsertColumnLeft, onInsertColumnRight, onDuplicateColumn, onDeleteColumns, onClear,
}) => {
  if (!menu || !rect) return null;
  const header = rect.band === 'header';
  const rowsCovered = rect.r1 - rect.r0 + 1;
  const colsCovered = rect.c1 - rect.c0 + 1;
  const rangeLabel = header
    ? `Header${colsCovered > 1 ? ` · columns ${rect.c0 + 1}–${rect.c1 + 1}` : ''}`
    : `${rowsCovered > 1 ? `Rows ${rect.r0 + 1}–${rect.r1 + 1}` : `Row ${rect.r0 + 1}`} · ${colsCovered > 1 ? `columns ${rect.c0 + 1}–${rect.c1 + 1}` : `column ${rect.c0 + 1}`}`;
  const run = (fn: () => void) => () => { fn(); onClose(); };
  return (
    <ContextMenu open x={menu.x} y={menu.y} theme="dark" onClose={onClose}>
      <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{rangeLabel}</div>
      <ContextMenuItem icon={<Combine className="w-3.5 h-3.5 shrink-0" />} disabled={!canMerge} onClick={run(onMerge)}>Merge cells</ContextMenuItem>
      <ContextMenuItem icon={<Ungroup className="w-3.5 h-3.5 shrink-0" />} disabled={!canUnmerge} onClick={run(onUnmerge)}>Unmerge</ContextMenuItem>
      {!header && (
        <>
          <ContextMenuDivider />
          <ContextMenuItem icon={<ArrowUp className="w-3.5 h-3.5 shrink-0" />} onClick={run(onInsertRowAbove)}>Insert row above</ContextMenuItem>
          <ContextMenuItem icon={<ArrowDown className="w-3.5 h-3.5 shrink-0" />} onClick={run(onInsertRowBelow)}>Insert row below</ContextMenuItem>
          <ContextMenuItem icon={<CopyPlus className="w-3.5 h-3.5 shrink-0" />} onClick={run(onDuplicateRow)}>Duplicate row</ContextMenuItem>
          <ContextMenuItem variant="danger" icon={<Trash2 className="w-3.5 h-3.5 shrink-0" />} disabled={!canDeleteRows} onClick={run(onDeleteRows)}>
            Delete row{rowsCovered > 1 ? 's' : ''}
          </ContextMenuItem>
        </>
      )}
      <ContextMenuDivider />
      <ContextMenuItem icon={<ArrowLeft className="w-3.5 h-3.5 shrink-0" />} onClick={run(onInsertColumnLeft)}>Insert column left</ContextMenuItem>
      <ContextMenuItem icon={<ArrowRight className="w-3.5 h-3.5 shrink-0" />} onClick={run(onInsertColumnRight)}>Insert column right</ContextMenuItem>
      <ContextMenuItem icon={<CopyPlus className="w-3.5 h-3.5 shrink-0" />} onClick={run(onDuplicateColumn)}>Duplicate column</ContextMenuItem>
      <ContextMenuItem variant="danger" icon={<Trash2 className="w-3.5 h-3.5 shrink-0" />} disabled={!canDeleteColumns} onClick={run(onDeleteColumns)}>
        Delete column{colsCovered > 1 ? 's' : ''}
      </ContextMenuItem>
      <ContextMenuDivider />
      <ContextMenuItem icon={<Eraser className="w-3.5 h-3.5 shrink-0" />} onClick={run(onClear)}>Clear contents</ContextMenuItem>
    </ContextMenu>
  );
};

export default CustomTableContextMenu;
