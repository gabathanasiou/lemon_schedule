import React from 'react';
import { ReportBlock, ReportCollection, ReportTextStyle } from '../../types';
import { Project } from '../../types';
import { COLLECTION_LABELS } from '../../lib/reportBlocks';
import { X, ArrowRightLeft } from 'lucide-react';
import {
  BlockCtx, BlockEditorContent, BLOCK_TYPE_META, TB_BTN_ICON, TB_DIVIDER, ToolButton,
} from './blockControls';

// Two surfaces for the block editor, one source of truth (BlockEditorContent):
//  - 'floating' — controls live in the chrome above the selected block
//  - 'toolbar'  — controls are pinned into this bar instead
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
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

const ReportToolbar: React.FC<ReportToolbarProps> = ({
  block, parentCollection, parentCategory, project, readOnly, editorMode,
  onToggleEditorMode, onDeselect, onPatch, onSaveTextStyles,
  onInsertAbove, onInsertBelow, onDuplicate, onRemove, onMove,
}) => {
  if (!block) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
        <span className="text-xs text-zinc-600">Select a block to edit it. Click an item in the palette to add it.</span>
      </div>
    );
  }

  const meta = BLOCK_TYPE_META[block.type] || { label: block.type, icon: null };
  const ctx: BlockCtx = { block, project, parentCollection, parentCategory, readOnly, onPatch, onSaveTextStyles };

  const switchLabel = editorMode === 'floating' ? 'Toolbar editor' : 'Floating editor';

  return (
    <div className="px-3 pt-2 pb-2 shrink-0 overflow-x-auto" onClick={e => e.stopPropagation()}>
      {editorMode === 'toolbar' ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800 select-none min-w-max">
          <BlockEditorContent
            {...ctx}
            onInsertAbove={onInsertAbove}
            onInsertBelow={onInsertBelow}
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
