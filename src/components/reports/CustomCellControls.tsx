import React from 'react';
import { ChromeHeader, TB_BTN_ICON, TB_DIVIDER, ToolButton } from '@gabriel/ui-kit';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowRightLeft, CopyPlus, RotateCcw, TableCellsMerge, Trash2, Ungroup } from 'lucide-react';
import { Project, ReportCellStyle, ReportTextStyle } from '../../types';
import { RichTextEditorHandle, RichTextState } from './RichTextEditor';
import { EditorGroup, EditorSection, editorRowCls } from './reportEditorLayout';
import RichTextControls from './RichTextControls';
import { CustomTableCells } from './useCustomTableCells';

// Free-table cell controls (roadmap 189) — the ONE body rendered by both the
// floating cell chrome and the docked inspector: the chrome header carries
// merge/unmerge/reset (icon actions, like every editor chrome), the body the
// shared rich-text Format + Style rows (roadmap 191 — the same body a canvas
// text block uses) and the row/column structure actions
// (insert/duplicate/delete). Reset clears the overrides + inline formatting
// back to the table defaults.

/** Row/column structure actions for the selected range — ONE mapping from the
 *  shared cell model so the floating chrome and the docked inspector render
 *  the same controls. */
export interface CellStructureOps {
  headerSelection: boolean;
  canDeleteRows: boolean;
  canDeleteColumns: boolean;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onDuplicateRow: () => void;
  onDeleteRows: () => void;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onDuplicateColumn: () => void;
  onDeleteColumns: () => void;
}

export function cellStructureOps(cells: CustomTableCells): CellStructureOps {
  const rect = cells.selectionRect;
  const focus = cells.selection?.focus;
  const focusRow = focus ? cells.rows.findIndex(r => r.id === focus.rowId) : -1;
  const focusCol = focus ? cells.columns.findIndex(c => c.id === focus.colId) : -1;
  return {
    headerSelection: rect?.band === 'header',
    canDeleteRows: cells.canDeleteRows,
    canDeleteColumns: cells.canDeleteColumns,
    onInsertRowAbove: () => { if (rect && rect.band === 'body') cells.insertRowAt(rect.r0); },
    onInsertRowBelow: () => { if (rect && rect.band === 'body') cells.insertRowAt(rect.r1 + 1); },
    onDuplicateRow: () => { if (focusRow >= 0 && rect?.band !== 'header') cells.duplicateRow(focusRow); },
    onDeleteRows: () => cells.deleteRows(),
    onInsertColumnLeft: () => { if (rect) cells.insertColumnAt(rect.c0); },
    onInsertColumnRight: () => { if (rect) cells.insertColumnAt(rect.c1 + 1); },
    onDuplicateColumn: () => { if (focusCol >= 0) cells.duplicateColumn(focusCol); },
    onDeleteColumns: () => cells.deleteColumns(),
  };
}

interface CustomCellControlsProps {
  /** Range description, e.g. "2 × 3 cells" / "No cells selected". */
  label: string;
  canMerge: boolean;
  canUnmerge: boolean;
  project: Project;
  /** Focus cell's effective style — the typography pickers' current values. */
  styleValue?: ReportCellStyle;
  /** The focused cell's editor handle — the shared body's exec target. */
  editorRef?: React.RefObject<RichTextEditorHandle | null>;
  /** Inline formatting state at the caret (lights the toggles). */
  active?: RichTextState;
  /** Multi-cell selection with differing overrides — object-level Mixed. */
  objectMixed?: { fontFamily: boolean; fontSize: boolean };
  readOnly?: boolean;
  /** Docked inspector layout: stacked ContentRows (context also drives them). */
  panel?: boolean;
  onMerge: () => void;
  onUnmerge: () => void;
  onStyle: (patch: Partial<ReportCellStyle>) => void;
  onReset: () => void;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  /** Floating chrome only: switch to the docked inspector (hosted in the
   *  cell chrome header, roadmap 205 follow-up). */
  onToggleEditorMode?: () => void;
  /** Row/column structure actions (insert/duplicate/delete) for the range. */
  structure?: CellStructureOps;
}

export const CustomCellControls: React.FC<CustomCellControlsProps> = ({
  label, canMerge, canUnmerge, project, styleValue, editorRef, active, objectMixed, readOnly, panel,
  onMerge, onUnmerge, onStyle, onReset, onSaveTextStyles, onToggleEditorMode, structure,
}) => {
  const hasSelection = label !== 'No cells selected';
  const disabled = !!readOnly || !hasSelection;

  return (
    <div className={panel ? 'flex flex-col gap-1.5 min-w-0 w-full' : 'flex flex-col gap-1.5 min-w-max'}>
      <ChromeHeader
        className="w-full"
        leading={
          <>
            <TableCellsMerge className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-semibold text-zinc-300 pr-1">{label}</span>
          </>
        }
        trailing={
          <>
            <ToolButton onClick={onMerge} disabled={disabled || !canMerge} title="Merge cells" className={TB_BTN_ICON}>
              <TableCellsMerge className="w-2.5 h-2.5" />
            </ToolButton>
            <ToolButton onClick={onUnmerge} disabled={disabled || !canUnmerge} title="Unmerge cells" className={TB_BTN_ICON}>
              <Ungroup className="w-2.5 h-2.5" />
            </ToolButton>
            <div className={TB_DIVIDER} />
            <ToolButton onClick={onReset} disabled={disabled} title="Reset to table default — clears cell styles and inline formatting" className={TB_BTN_ICON}>
              <RotateCcw className="w-2.5 h-2.5" />
            </ToolButton>
            {onToggleEditorMode && (
              <>
                <div className={TB_DIVIDER} />
                <ToolButton onClick={onToggleEditorMode} disabled={false} title="Toolbar editor" className={TB_BTN_ICON}><ArrowRightLeft className="w-3 h-3" /></ToolButton>
              </>
            )}
          </>
        }
      />
      {editorRef && (
        <div className={panel ? 'flex flex-col gap-1.5 px-2.5 pb-1.5' : 'flex flex-col gap-1 px-2.5 pb-1.5'}>
          <RichTextControls
            project={project}
            editorRef={editorRef}
            active={active}
            disabled={disabled}
            value={{
              fontFamily: styleValue?.fontFamily,
              fontSize: styleValue?.fontSize,
              textStyle: styleValue?.textStyle,
              align: styleValue?.align,
              verticalAlign: styleValue?.verticalAlign,
            }}
            objectMixed={objectMixed}
            onDefaults={onStyle}
            onStyle={onStyle}
            verticalAlign
            onSaveTextStyles={onSaveTextStyles}
          />
          {structure && (
            <div className={panel ? 'flex flex-wrap items-start gap-x-4 gap-y-2 min-w-0' : 'flex items-center gap-4'}>
              {!structure.headerSelection && (
                <EditorSection label="Row">
                  <div className={editorRowCls(panel)}>
                    <EditorGroup>
                      <ToolButton onClick={structure.onInsertRowAbove} disabled={disabled} title="Insert row above" className={TB_BTN_ICON}><ArrowUp className="w-3 h-3" /></ToolButton>
                      <ToolButton onClick={structure.onInsertRowBelow} disabled={disabled} title="Insert row below" className={TB_BTN_ICON}><ArrowDown className="w-3 h-3" /></ToolButton>
                      <ToolButton onClick={structure.onDuplicateRow} disabled={disabled} title="Duplicate row" className={TB_BTN_ICON}><CopyPlus className="w-3 h-3" /></ToolButton>
                      <ToolButton onClick={structure.onDeleteRows} disabled={disabled || !structure.canDeleteRows} title="Delete row(s)" className={TB_BTN_ICON}><Trash2 className="w-3 h-3" /></ToolButton>
                    </EditorGroup>
                  </div>
                </EditorSection>
              )}
              {!panel && !structure.headerSelection && <div className={TB_DIVIDER} />}
              <EditorSection label="Column">
                <div className={editorRowCls(panel)}>
                  <EditorGroup>
                    <ToolButton onClick={structure.onInsertColumnLeft} disabled={disabled} title="Insert column left" className={TB_BTN_ICON}><ArrowLeft className="w-3 h-3" /></ToolButton>
                    <ToolButton onClick={structure.onInsertColumnRight} disabled={disabled} title="Insert column right" className={TB_BTN_ICON}><ArrowRight className="w-3 h-3" /></ToolButton>
                    <ToolButton onClick={structure.onDuplicateColumn} disabled={disabled} title="Duplicate column" className={TB_BTN_ICON}><CopyPlus className="w-3 h-3" /></ToolButton>
                    <ToolButton onClick={structure.onDeleteColumns} disabled={disabled || !structure.canDeleteColumns} title="Delete column(s)" className={TB_BTN_ICON}><Trash2 className="w-3 h-3" /></ToolButton>
                  </EditorGroup>
                </div>
              </EditorSection>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomCellControls;
