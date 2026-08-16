import React, { useMemo } from 'react';
import { ReportBlock } from '../../types';
import { COLLECTION_LABELS } from '../../lib/reportBlocks';
import { getReportFieldDefs, fieldsForScope, ReportFieldDef, isGlobalField, smartFieldLabel } from '../../lib/reportFields';
import { Project } from '../../types';

export interface MenuState { x: number; y: number; id: string; colIndex?: number; }

interface ReportContextMenuProps {
  menu: MenuState;
  block: ReportBlock;
  project: Project;
  insertScope: string | null;
  insertCategory?: string;
  onClose: () => void;
  onChangeField: (field: string) => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onAddChild: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onColumnInsertAt: (colIndex: number) => void;
  onColumnMove: (dir: -1 | 1) => void;
  onColumnRemove: () => void;
}

const ReportContextMenu: React.FC<ReportContextMenuProps> = ({ menu, block, project, insertScope, insertCategory, onClose, onChangeField, onInsertAbove, onInsertBelow, onAddChild, onDuplicate, onRemove, onColumnInsertAt, onColumnMove, onColumnRemove }) => {
  const fields: ReportFieldDef[] = useMemo(
    () => block.type === 'field' || (block.type === 'table' && menu.colIndex !== undefined) ? fieldsForScope(getReportFieldDefs(project), insertScope, insertCategory) : [],
    [block.type, menu.colIndex, project, insertScope, insertCategory],
  );
  const itemCls = 'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 rounded transition-colors';
  const isColumnMenu = menu.colIndex !== undefined;
  const isTableColumn = isColumnMenu && block.type === 'table';
  const labelOf = (f: ReportFieldDef) => f.scope === 'smart' ? smartFieldLabel(f.label, insertScope) : f.label;

  return (
    <div
      className="fixed inset-0 z-[99]"
      onMouseDown={onClose}
      onContextMenu={e => { e.preventDefault(); onClose(); }}
    >
      <div
        className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl p-1.5 min-w-[220px]"
        style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 260), top: Math.min(menu.y, window.innerHeight - 320) }}
        onMouseDown={e => e.stopPropagation()}
      >
        {isColumnMenu && (
          <>
            <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {isTableColumn ? `Table column ${menu.colIndex! + 1} of ${(block.columns || []).length}` : `Column ${menu.colIndex! + 1} of ${(block.cols || []).length}`}
            </div>
            {isTableColumn && (
              <>
                <div className="max-h-[220px] overflow-y-auto">
                  {fields.filter(f => !isGlobalField(f)).map(f => (
                    <button key={f.key} className={itemCls} onClick={() => { onChangeField(f.key); onClose(); }}>
                      <span className="truncate">{labelOf(f)}</span>
                    </button>
                  ))}
                  {fields.some(f => isGlobalField(f)) && fields.some(f => !isGlobalField(f)) && (
                    <>
                      <div className="px-2.5 pt-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-t border-zinc-800 mt-1">Global</div>
                      {fields.filter(isGlobalField).map(f => (
                        <button key={f.key} className={itemCls} onClick={() => { onChangeField(f.key); onClose(); }}>
                          <span className="truncate">{labelOf(f)}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
                <div className="border-t border-zinc-800 my-1" />
                <button className={itemCls} onClick={() => { onColumnMove(-1); onClose(); }}>Move column left</button>
                <button className={itemCls} onClick={() => { onColumnMove(1); onClose(); }}>Move column right</button>
                <div className="border-t border-zinc-800 my-1" />
              </>
            )}
            <button className={itemCls} onClick={() => { onColumnInsertAt(menu.colIndex!); onClose(); }}>Insert column before</button>
            <button className={itemCls} onClick={() => { onColumnInsertAt(menu.colIndex! + 1); onClose(); }}>Insert column after</button>
            <div className="border-t border-zinc-800 my-1" />
            <button className={`${itemCls} text-red-400 hover:text-red-300`} onClick={() => { onColumnRemove(); onClose(); }}>Delete column</button>
          </>
        )}
        {!isColumnMenu && block.type === 'field' && (
          <>
            <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Change field</div>
            <div className="max-h-[220px] overflow-y-auto">
              {fields.filter(f => !isGlobalField(f)).map(f => (
                <button key={f.key} className={itemCls} onClick={() => { onChangeField(f.key); onClose(); }}>
                  <span className="truncate">{labelOf(f)}</span>
                </button>
              ))}
              {fields.some(f => isGlobalField(f)) && fields.some(f => !isGlobalField(f)) && (
                <>
                  <div className="px-2.5 pt-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-t border-zinc-800 mt-1">Global</div>
                  {fields.filter(isGlobalField).map(f => (
                    <button key={f.key} className={itemCls} onClick={() => { onChangeField(f.key); onClose(); }}>
                      <span className="truncate">{labelOf(f)}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
            <div className="border-t border-zinc-800 my-1" />
          </>
        )}
        {!isColumnMenu && (block.type === 'repeat' || block.type === 'table' || block.type === 'relative') && (
          <>
            <button className={itemCls} onClick={() => { onAddChild(); onClose(); }}>
              Add block inside ({COLLECTION_LABELS[block.collection || 'scenes']})
            </button>
            <div className="border-t border-zinc-800 my-1" />
          </>
        )}
        {!isColumnMenu && (
          <>
            <button className={itemCls} onClick={() => { onInsertAbove(); onClose(); }}>Insert above</button>
            <button className={itemCls} onClick={() => { onInsertBelow(); onClose(); }}>Insert below</button>
            <button className={itemCls} onClick={() => { onDuplicate(); onClose(); }}>Duplicate</button>
            <div className="border-t border-zinc-800 my-1" />
            <button className={`${itemCls} text-red-400 hover:text-red-300`} onClick={() => { onRemove(); onClose(); }}>Delete block</button>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportContextMenu;
