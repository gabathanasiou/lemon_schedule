import React from 'react';
import { ChromeHeader, SectionHeader, TB_BTN_ICON, TB_DANGER, TB_DIVIDER, TB_PICKER, TB_TOGGLE, TB_TOGGLE_OFF, TB_TOGGLE_ON, ToolButton } from '@gabriel/ui-kit';
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, EyeOff, Plus, Trash2 } from 'lucide-react';
import { Project, ReportBlock, ReportCollection, ReportTableColumn } from '../../types';
import { fieldsForScope } from '../../lib/reportFields';
import { tableFieldScope } from '../../lib/reportBlocks';
import { FieldPicker } from './FieldPicker';
import { Tooltip } from '../Tooltip';
import { ContentRow, EditorGroup, editorFieldCls, editorRowCls, useBlockEditorPanel } from './reportEditorLayout';
import { useReportControlContext } from './blockControls';

// ---- column editors (table columns AND columns-block columns) -------------------
// Shared by the floating column chromes (ReportDesignerCanvas) and the docked
// inspector panel (ReportToolbar) — one source of truth per column kind. Each
// renders its own `ChromeHeader` ("Column N of M") so both surfaces match; the
// floating wrappers pass a trailing ✕, the panel leaves it to the rail header.

/** Structure ops for any column/row — insert before/after, move; delete lives
 *  in the header (same slot as the block chrome's structure actions). */
export const ColumnStructureControls: React.FC<{
  colIndex: number;
  colsCount: number;
  readOnly: boolean;
  onInsertAt: (at: number) => void;
  onMove: (dir: -1 | 1) => void;
  /** Row-axis tables render the same list as matrix rows. */
  orientation?: 'columns' | 'rows';
}> = ({ colIndex, colsCount, readOnly, onInsertAt, onMove, orientation = 'columns' }) => {
  const panel = useBlockEditorPanel();
  const rows = orientation === 'rows';
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader>Structure</SectionHeader>
      <div className={editorRowCls(panel)}>
        <EditorGroup>
          <ToolButton onClick={() => onInsertAt(colIndex)} disabled={readOnly} title={rows ? 'Insert row above' : 'Insert column before'} className={TB_BTN_ICON}><Plus className="w-3 h-3" /> {rows ? 'Above' : 'Before'}</ToolButton>
          <ToolButton onClick={() => onInsertAt(colIndex + 1)} disabled={readOnly} title={rows ? 'Insert row below' : 'Insert column after'} className={TB_BTN_ICON}><Plus className="w-3 h-3" /> {rows ? 'Below' : 'After'}</ToolButton>
        </EditorGroup>
        <div className={TB_DIVIDER} />
        <EditorGroup>
          <ToolButton onClick={() => onMove(-1)} disabled={readOnly || colIndex <= 0} title={rows ? 'Move row up' : 'Move column left'} className={TB_BTN_ICON}>
            {rows ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowLeft className="w-2.5 h-2.5" />} {rows ? 'Up' : 'Left'}
          </ToolButton>
          <ToolButton onClick={() => onMove(1)} disabled={readOnly || colIndex >= colsCount - 1} title={rows ? 'Move row down' : 'Move column right'} className={TB_BTN_ICON}>
            {rows ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowRight className="w-2.5 h-2.5" />} {rows ? 'Down' : 'Right'}
          </ToolButton>
        </EditorGroup>
      </div>
    </div>
  );
};

const ColumnHeader: React.FC<{
  colIndex: number;
  colsCount: number;
  readOnly: boolean;
  onDelete: () => void;
  orientation?: 'columns' | 'rows';
  headerTrailing?: React.ReactNode;
}> = ({ colIndex, colsCount, readOnly, onDelete, orientation = 'columns', headerTrailing }) => {
  const rows = orientation === 'rows';
  return (
    <ChromeHeader
      className="w-full"
      leading={<span className="text-[10px] font-semibold text-zinc-300 pr-1">{rows ? 'Row' : 'Column'} {colIndex + 1} of {colsCount}</span>}
      trailing={
        <>
          <ToolButton onClick={onDelete} disabled={readOnly || colsCount <= 1} title={rows ? 'Delete row' : 'Delete column'} className={`${TB_BTN_ICON} ${TB_DANGER}`}><Trash2 className="w-2.5 h-2.5" /></ToolButton>
          {headerTrailing && (
            <>
              <div className={TB_DIVIDER} />
              {headerTrailing}
            </>
          )}
        </>
      }
    />
  );
};

/** Table attribute editor body (columns-mode column / rows-mode row):
 *  attribute + per-entry style + structure. */
export const TableColumnEditorContent: React.FC<{
  block: ReportBlock;
  colIndex: number;
  project: Project;
  parentCollection?: ReportCollection;
  readOnly: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onInsertAt: (at: number) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  /** Rows-axis tables render the attribute list as matrix rows. */
  axis?: 'columns' | 'rows';
  /** Floating chrome only: the deselect ✕ (the panel's rail header owns it). */
  headerTrailing?: React.ReactNode;
}> = ({ block, colIndex, project, parentCollection, readOnly, onPatch, onInsertAt, onMove, onDelete, axis = 'columns', headerTrailing }) => {
  const panel = useBlockEditorPanel();
  const rows = axis === 'rows';
  const { allFields } = useReportControlContext(project, parentCollection);
  const scope = tableFieldScope(block, parentCollection);
  const columns = block.columns || [];
  const col = columns[colIndex];
  if (!col) return null;
  const disabled = readOnly;
  const patchCol = (p: Partial<ReportTableColumn>) => onPatch({ columns: columns.map((c, i) => i === colIndex ? { ...c, ...p } : c) });
  return (
    <div className={panel ? 'flex flex-col gap-1.5 min-w-0 w-full' : 'flex flex-col gap-1.5 min-w-max'}>
      <ColumnHeader colIndex={colIndex} colsCount={columns.length} readOnly={readOnly} onDelete={onDelete} orientation={axis} headerTrailing={headerTrailing} />
      <div className={panel ? 'flex flex-col gap-1.5 min-w-0 w-full px-2.5' : 'flex flex-col gap-1.5 min-w-max px-2.5'}>
        <ContentRow label="Attribute">
          <FieldPicker
            value={col.field}
            fields={fieldsForScope(allFields, scope, block.category)}
            onChange={f => patchCol({ field: f })}
            disabled={disabled}
            scope={scope}
            className={`${editorFieldCls(panel, 'w-44')} ${TB_PICKER}`}
          />
        </ContentRow>
        <div className="flex flex-col gap-1">
          <SectionHeader>{rows ? 'Row' : 'Column'}</SectionHeader>
          <div className={editorRowCls(panel)}>
            <EditorGroup>
              <Tooltip content="Bold">
                <button disabled={disabled} onClick={() => patchCol({ bold: !col.bold })} className={`${TB_TOGGLE} ${col.bold ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}>
                  <span className="text-[10px] font-bold">B</span>
                </button>
              </Tooltip>
              <Tooltip content="Italic">
                <button disabled={disabled} onClick={() => patchCol({ italic: !col.italic })} className={`${TB_TOGGLE} ${col.italic ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}>
                  <span className="text-[10px] italic">I</span>
                </button>
              </Tooltip>
              {!rows && (
                <Tooltip content="Hide rows where this column is empty">
                  <button disabled={disabled} onClick={() => patchCol({ skipEmpty: !col.skipEmpty })} className={`${TB_TOGGLE} ${col.skipEmpty ? 'bg-amber-900/50 border-amber-700 text-amber-300' : TB_TOGGLE_OFF}`}>
                    <EyeOff className="w-3 h-3" />
                  </button>
                </Tooltip>
              )}
            </EditorGroup>
            <div className={TB_DIVIDER} />
            <EditorGroup>
              {(['left', 'center', 'right'] as const).map(a => {
                const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
                const on = (col.align ?? 'left') === a;
                return (
                  <Tooltip key={a} content={`Align ${a}`}>
                    <button disabled={disabled} onClick={() => patchCol({ align: a })} className={`${TB_TOGGLE} ${on ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}>
                      <Icon className="w-3 h-3" />
                    </button>
                  </Tooltip>
                );
              })}
            </EditorGroup>
          </div>
        </div>
        <ColumnStructureControls
          colIndex={colIndex}
          colsCount={columns.length}
          readOnly={readOnly}
          onInsertAt={onInsertAt}
          onMove={onMove}
          orientation={axis}
        />
      </div>
    </div>
  );
};

/** Columns-block column editor body: structure ops only. */
export const ColumnsColumnEditorContent: React.FC<{
  colIndex: number;
  colsCount: number;
  readOnly: boolean;
  onInsertAt: (at: number) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  /** Floating chrome only: the deselect ✕ (the panel's rail header owns it). */
  headerTrailing?: React.ReactNode;
}> = ({ colIndex, colsCount, readOnly, onInsertAt, onMove, onDelete, headerTrailing }) => {
  const panel = useBlockEditorPanel();
  return (
    <div className={panel ? 'flex flex-col gap-1.5 min-w-0 w-full' : 'flex flex-col gap-1.5 min-w-max'}>
      <ColumnHeader colIndex={colIndex} colsCount={colsCount} readOnly={readOnly} onDelete={onDelete} headerTrailing={headerTrailing} />
      <div className="flex flex-col gap-1.5 px-2.5">
        <ColumnStructureControls
          colIndex={colIndex}
          colsCount={colsCount}
          readOnly={readOnly}
          onInsertAt={onInsertAt}
          onMove={onMove}
        />
      </div>
    </div>
  );
};
