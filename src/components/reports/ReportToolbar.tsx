import React from 'react';
import { ReportBlock, ReportCollection } from '../../types';
import { COLLECTION_LABELS } from '../../lib/reportBlocks';
import { BLOCK_TYPE_META } from './blockControls';

// All block controls live in the floating editor above the selected block —
// this bar only shows context (what's selected, where to edit).

interface ReportToolbarProps {
  block: ReportBlock | null;
  parentCollection?: ReportCollection;
}

const ReportToolbar: React.FC<ReportToolbarProps> = ({ block, parentCollection }) => {
  if (!block) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
        <span className="text-xs text-zinc-600">Select a block to edit it. Click an item in the palette to add it.</span>
      </div>
    );
  }

  const meta = BLOCK_TYPE_META[block.type] || { label: block.type, icon: null };
  return (
    <div className="px-3 pt-2 pb-2 shrink-0 overflow-x-auto" onClick={e => e.stopPropagation()}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 flex items-center gap-2 select-none min-w-max">
        {meta.icon}
        <span className="text-[10px] font-semibold text-zinc-400">{meta.label}</span>
        {block.collection && (
          <span className="text-[10px] text-zinc-600">· {COLLECTION_LABELS[block.collection]}</span>
        )}
        <span className="text-[10px] text-zinc-600">— edit in the floating bar above the block</span>
      </div>
    </div>
  );
};

export default ReportToolbar;
