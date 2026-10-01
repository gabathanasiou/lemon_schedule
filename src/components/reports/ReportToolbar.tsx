import React from 'react';
import { TB_BTN_ICON, TB_DIVIDER, ToolButton } from '@gabriel/ui-kit';
import { ReportBlock, ReportCollection, ReportTextStyle } from '../../types';
import { Project } from '../../types';
import { COLLECTION_LABELS } from '../../lib/reportBlocks';
import { X, ArrowRightLeft } from 'lucide-react';
import {
  BlockCtx, BlockEditorContent, BLOCK_TYPE_META,
} from './blockControls';
import { ColumnsColumnEditorContent, TableColumnEditorContent } from './reportColumnControls';
import { BlockEditorPanelContext } from './reportEditorLayout';
import type { ColSel } from './ReportDesignerCanvas';

// Three surfaces for the block/column editors, one source of truth per editor:
//  - 'floating' — controls live in the chrome above the selected block/column
//  - 'toolbar'  — the block controls are pinned into this bar instead
//  - `panel`    — the pinned controls dock into the left inspector column
// The bar always offers Deselect and a button to switch surfaces.

interface ReportToolbarProps {
  block: ReportBlock | null;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  project: Project;
  readOnly: boolean;
  editorMode: 'floating' | 'toolbar';
  onToggleEditorMode: () => void;
  onDeselect: () => void;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** Dock the editor into the left inspector column instead of a top bar. */
  panel?: boolean;
  /** Panel only: the selected table/columns column + its owner block. */
  colSel?: ColSel | null;
  colBlock?: ReportBlock | null;
  onColPatch?: (patch: Partial<ReportBlock>) => void;
  onColInsertAt?: (at: number) => void;
  onColMove?: (dir: -1 | 1) => void;
  onColDelete?: () => void;
}

const ReportToolbar: React.FC<ReportToolbarProps> = ({
  block, parentCollection, parentCategory, project, readOnly, editorMode,
  onToggleEditorMode, onDeselect, onPatch, onSaveTextStyles,
  onDuplicate, onRemove, onMove, panel,
  colSel, colBlock, onColPatch, onColInsertAt, onColMove, onColDelete,
}) => {
  const hint = 'Select a block to edit it. Click an item in the palette to add it.';
  const noop = () => {};

  if (panel) {
    // The shared column/block editors read the panel layout from context; the
    // rail is always a panel surface, so provide it here (BlockEditorContent
    // provides its own value too).
    const body = colBlock && colSel ? (
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2" onClick={e => e.stopPropagation()}>
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
          />
        ) : (
          <ColumnsColumnEditorContent
            colIndex={colSel.colIndex}
            colsCount={colBlock.cols?.length ?? 0}
            readOnly={readOnly}
            onInsertAt={onColInsertAt || noop}
            onMove={onColMove || noop}
            onDelete={onColDelete || noop}
          />
        )}
      </div>
    ) : !block ? (
      <div className="flex-1 px-3 py-2">
        <span className="text-[10px] text-zinc-600">{hint}</span>
      </div>
    ) : (
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2" onClick={e => e.stopPropagation()}>
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
        />
      </div>
    );
    return <BlockEditorPanelContext.Provider value={true}>{body}</BlockEditorPanelContext.Provider>;
  }

  if (!block) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
        <span className="text-xs text-zinc-600">{hint}</span>
      </div>
    );
  }

  const meta = BLOCK_TYPE_META[block.type] || { label: block.type, icon: null };
  const ctx: BlockCtx = { block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles };

  const switchLabel = editorMode === 'floating' ? 'Toolbar editor' : 'Floating editor';

  return (
    <div className="px-3 pt-2 pb-2 shrink-0 overflow-x-auto" onClick={e => e.stopPropagation()}>
      {editorMode === 'toolbar' ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg select-none min-w-max">
          <BlockEditorContent
            {...ctx}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
            onMove={onMove}
            trailing={
              <>
                <div className={TB_DIVIDER} />
                <ToolButton onClick={onDeselect} title="Deselect block" className={TB_BTN_ICON}><X className="w-2.5 h-2.5" /> Deselect</ToolButton>
                <ToolButton onClick={onToggleEditorMode} title={switchLabel} className={TB_BTN_ICON}><ArrowRightLeft className="w-2.5 h-2.5" /> {switchLabel}</ToolButton>
              </>
            }
          />
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 flex items-center gap-2 select-none min-w-max">
          {meta.icon}
          <span className="text-[10px] font-semibold text-zinc-400">{meta.label}</span>
          {block.collection && (
            <span className="text-[10px] text-zinc-600">· {COLLECTION_LABELS[block.collection]}</span>
          )}
          <span className="text-[10px] text-zinc-600">— edit in the floating bar above the block</span>
          <div className="ml-auto flex items-center gap-1 pl-3">
            <ToolButton onClick={onToggleEditorMode} title={switchLabel} className={TB_BTN_ICON}><ArrowRightLeft className="w-2.5 h-2.5" /> {switchLabel}</ToolButton>
            <ToolButton onClick={onDeselect} title="Deselect block" className={TB_BTN_ICON}><X className="w-2.5 h-2.5" /> Deselect</ToolButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportToolbar;
