import React from 'react';
import { ReportBlock, ReportCollection } from '../../types';
import { Project } from '../../types';
import { COLLECTION_LABELS } from '../../lib/reportBlocks';
import { Plus, Trash2 } from 'lucide-react';
import {
  BlockCtx, BLOCK_TYPE_META, StructureControls, ContentControls, StyleControls, LayoutControls,
  TB_ROW_LABEL, TB_BTN, TB_BTN_ICON, TB_DANGER, TB_DIVIDER, ToolButton,
} from './blockControls';

interface ReportToolbarProps {
  block: ReportBlock | null;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  project: Project;
  readOnly: boolean;
  selCol?: { colIndex: number; colsCount: number } | null;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onInsertColumnAt: (colIndex: number) => void;
  onAddTextToColumn: () => void;
}

const ReportToolbar: React.FC<ReportToolbarProps> = ({ block, parentCollection, parentCategory, project, readOnly, selCol, onPatch, onInsertAbove, onInsertBelow, onDuplicate, onRemove, onMove, onInsertColumnAt, onAddTextToColumn }) => {
  if (!block) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
        <span className="text-xs text-zinc-600">Select a block to edit it. Click an item in the palette to add it.</span>
      </div>
    );
  }

  const disabled = readOnly;
  const meta = BLOCK_TYPE_META[block.type] || { label: block.type, icon: null };
  const ctx: BlockCtx = { block, project, parentCollection, parentCategory, readOnly, onPatch };

  const structureLabel = (
    <span className="flex items-center gap-1">
      {meta.icon}
      {meta.label}
      {block.collection ? ` · ${COLLECTION_LABELS[block.collection]}` : ''}
    </span>
  );

  return (
    <div className="px-3 pt-2 pb-2 shrink-0 overflow-x-auto" onClick={e => e.stopPropagation()}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800 select-none min-w-max">
        {selCol ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
            <span className={TB_ROW_LABEL}>Column {selCol.colIndex + 1} of {selCol.colsCount}</span>
            <ToolButton onClick={() => onInsertColumnAt(selCol.colIndex)} disabled={disabled} title="Insert column before"><Plus className="w-3 h-3" /> Before</ToolButton>
            <ToolButton onClick={() => onInsertColumnAt(selCol.colIndex + 1)} disabled={disabled} title="Insert column after"><Plus className="w-3 h-3" /> After</ToolButton>
            <ToolButton onClick={onAddTextToColumn} disabled={disabled} title="Add text block to column"><Plus className="w-3 h-3" /> Text</ToolButton>
            <div className={TB_DIVIDER} />
            <ToolButton onClick={onRemove} disabled={disabled || selCol.colsCount <= 1} title="Delete column" className={`${TB_BTN_ICON} ${TB_DANGER}`}><Trash2 className="w-2.5 h-2.5" /></ToolButton>
            <span className="text-[10px] text-zinc-600 pl-2">Select a column on the canvas, or hover a divider to resize.</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
            <span className={TB_ROW_LABEL}>Structure</span>
            <StructureControls
              label={structureLabel}
              readOnly={disabled}
              onInsertAbove={onInsertAbove}
              onInsertBelow={onInsertBelow}
              onDuplicate={onDuplicate}
              onRemove={onRemove}
              onMove={onMove}
            />
          </div>
        )}

        {!selCol && (
          <div className="flex items-start gap-x-4 gap-y-2 px-3 py-1.5 flex-wrap min-w-max">
            <span className={`${TB_ROW_LABEL} pt-0.5`}>Content</span>
            <ContentControls {...ctx} />
          </div>
        )}

        {(block.type === 'text' || block.type === 'field') && !selCol && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
            <span className={TB_ROW_LABEL}>Style</span>
            <StyleControls {...ctx} />
          </div>
        )}

        {(block.type === 'text' || block.type === 'field') && !selCol && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
            <span className={TB_ROW_LABEL}>Layout</span>
            <LayoutControls {...ctx} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportToolbar;
