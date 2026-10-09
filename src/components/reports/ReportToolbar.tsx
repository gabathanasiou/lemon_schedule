import React from 'react';
import { TB_DIVIDER } from '@gabriel/ui-kit';
import { ReportBlock, ReportCollection, ReportTextStyle } from '../../types';
import { Project } from '../../types';
import {
  BlockEditorContent,
} from './blockControls';
import { RichTextEditorHandle, RichTextState } from './RichTextEditor';
import { ColumnsColumnEditorContent, TableColumnEditorContent } from './reportColumnControls';
import { BlockEditorPanelContext, EditorGroup } from './reportEditorLayout';
import type { ColSel } from './ReportDesignerCanvas';

// The docked inspector rail's editor body — the block or column editor. The
// rail's own actions (surface switch + collapse, and previously Deselect) fold
// into the chrome header's trailing slot (roadmap 205), so the rail needs no
// separate header bar. The floating surface hosts the switch in the floating
// chrome's header; deselect is Esc / click-away.

interface ReportToolbarProps {
  block: ReportBlock | null;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  project: Project;
  readOnly: boolean;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** Rail actions rendered at the end of the chrome header (surface switch,
   *  collapse). The block editor gets a leading divider; the column header
   *  adds its own. */
  headerActions?: React.ReactNode;
  /** The selected table/columns column + its owner block. */
  colSel?: ColSel | null;
  colBlock?: ReportBlock | null;
  onColPatch?: (patch: Partial<ReportBlock>) => void;
  onColInsertAt?: (at: number) => void;
  onColMove?: (dir: -1 | 1) => void;
  onColDelete?: () => void;
  /** Free-table cell controls (roadmap 189) — rendered under the block editor. */
  cellControls?: React.ReactNode;
  /** Inline text editing channel (roadmap 191) — the shared Format/Style body
   *  binds to the canvas text block's live editor. */
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  active?: RichTextState;
  chipKey?: string | null;
}

const ReportToolbar: React.FC<ReportToolbarProps> = ({
  block, parentCollection, parentCategory, project, readOnly,
  onPatch, onSaveTextStyles,
  onDuplicate, onRemove, onMove,
  colSel, colBlock, onColPatch, onColInsertAt, onColMove, onColDelete,
  cellControls, editorRef, active, chipKey, headerActions,
}) => {
  const noop = () => {};

  const body = colBlock && colSel ? (
    <div className="flex-1 min-h-0 overflow-y-auto py-2" onClick={e => e.stopPropagation()}>
      {colBlock.type === 'table' ? (
        <TableColumnEditorContent
          block={colBlock}
          colIndex={colSel.colIndex}
          project={project}
          parentCollection={parentCollection}
          readOnly={readOnly}
          onPatch={onColPatch || noop}
          onInsertAt={onColInsertAt || noop}
          onMove={onColMove || noop}
          onDelete={onColDelete || noop}
          axis={colBlock.axis ?? 'columns'}
          headerTrailing={headerActions}
        />
      ) : (
        <ColumnsColumnEditorContent
          colIndex={colSel.colIndex}
          colsCount={colBlock.cols?.length ?? 0}
          readOnly={readOnly}
          onInsertAt={onColInsertAt || noop}
          onMove={onColMove || noop}
          onDelete={onColDelete || noop}
          headerTrailing={headerActions}
        />
      )}
    </div>
  ) : !block ? null : (
    <div className="flex-1 min-h-0 overflow-y-auto py-2" onClick={e => e.stopPropagation()}>
      <BlockEditorContent
        block={block}
        project={project}
        parentCollection={parentCollection}
        parentCategory={parentCategory}
        readOnly={readOnly}
        onPatch={onPatch}
        onSaveTextStyles={onSaveTextStyles}
        panel
        compact
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onMove={onMove}
        editorRef={editorRef}
        active={active}
        chipKey={chipKey}
        trailing={headerActions ? (
          <EditorGroup>
            <div className={TB_DIVIDER} />
            {headerActions}
          </EditorGroup>
        ) : undefined}
      />
      {cellControls && <div className="mt-2 pt-2 border-t border-zinc-800">{cellControls}</div>}
    </div>
  );
  return <BlockEditorPanelContext.Provider value={true}>{body}</BlockEditorPanelContext.Provider>;
};

export default ReportToolbar;
