import React from 'react';
import { diffArrays } from 'diff';
import type { ScriptBlock, ScriptBlockType, ScriptScene } from '../../types';

/**
 * Screenplay renderer (roadmap 123 Phase 1, reused by 38's update review) —
 * renders retained `ScriptScene` blocks in proper screenplay format: Courier,
 * standard indents, dual dialogue columns, transitions right-aligned. Styles
 * only; the caller supplies the block data.
 */

export type BlockTone = 'same' | 'added' | 'removed' | 'changed';

export interface TonedBlock {
  type: ScriptBlockType;
  text: string;
  tone: BlockTone;
  /** Heading only: inline segments so a changed set / INT-EXT / day-night can
   *  be marked individually instead of the whole heading. `user` = your in-app
   *  edit (blue); `incoming` = the new script changed it (green). */
  parts?: { text: string; change?: 'user' | 'incoming' }[];
}

const TONE_CLASS: Record<BlockTone, string> = {
  same: '',
  added: 'bg-emerald-500/15',
  removed: 'bg-red-500/15 text-red-300/90 line-through decoration-red-400/60',
  /** Your in-app edit (not the imported baseline) — blue marker. */
  changed: 'bg-blue-500/15 text-blue-200',
};

function BlockLine({ type, text, tone, parts }: TonedBlock) {
  const toneCls = TONE_CLASS[tone];
  switch (type) {
    case 'page_break':
      return <div className="my-2 border-t border-dashed border-zinc-600/60" />;
    case 'heading':
      return (
        <div className={`mt-4 font-bold uppercase tracking-wide ${toneCls}`}>
          {parts
            ? parts.map((p, i) => (
                <span
                  key={i}
                  className={
                    p.change === 'user' ? 'text-blue-300 bg-blue-500/20 rounded px-0.5'
                      : p.change === 'incoming' ? 'text-emerald-300 bg-emerald-500/20 rounded px-0.5'
                        : ''
                  }
                >
                  {p.text}
                </span>
              ))
            : text}
        </div>
      );
    case 'character':
      return <div className={`mt-3 pl-[36%] uppercase ${toneCls}`}>{text}</div>;
    case 'parenthetical':
      return <div className={`pl-[30%] pr-[26%] italic ${toneCls}`}>{text}</div>;
    case 'dialogue':
    case 'dual_left':
    case 'dual_right':
      return <div className={`pl-[22%] pr-[26%] ${toneCls}`}>{text}</div>;
    case 'transition':
      return <div className={`mt-3 text-right uppercase ${toneCls}`}>{text}</div>;
    case 'shot':
      return <div className={`mt-3 uppercase ${toneCls}`}>{text}</div>;
    case 'action':
    default:
      return <div className={`mt-2 ${toneCls}`}>{text}</div>;
  }
}

const DUAL_RUN_TYPES = new Set<ScriptBlockType>(['character', 'parenthetical', 'dual_left', 'dual_right']);

/** Split a run of dual blocks into left/right columns at the character cue
 *  immediately before the first `dual_right`. */
function DualColumns({ run }: { run: TonedBlock[] }) {
  const rightIdx = run.findIndex(b => b.type === 'dual_right');
  let splitAt = rightIdx === -1 ? run.length : rightIdx;
  if (rightIdx > 0) {
    for (let i = rightIdx - 1; i >= 0; i--) {
      if (run[i].type === 'character') { splitAt = i; break; }
    }
  }
  const left = splitAt === -1 ? [] : run.slice(0, splitAt);
  const right = splitAt === -1 ? [] : run.slice(splitAt);
  return (
    <div className="grid grid-cols-2 gap-x-6 mt-1">
      <div>{left.map((b, i) => <BlockLine key={i} {...b} />)}</div>
      <div>{right.map((b, i) => <BlockLine key={i} {...b} />)}</div>
    </div>
  );
}

export function ScriptBlocksToned({ lines }: { lines: TonedBlock[] }) {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const block = lines[i];
    if (block.type === 'dual_left' || block.type === 'dual_right') {
      const run: TonedBlock[] = [];
      while (i < lines.length && DUAL_RUN_TYPES.has(lines[i].type)) { run.push(lines[i]); i++; }
      out.push(<DualColumns key={`dual-${i}`} run={run} />);
    } else {
      out.push(<BlockLine key={i} {...block} />);
      i++;
    }
  }
  return <>{out}</>;
}

const sameTone = (blocks: ScriptBlock[]): TonedBlock[] =>
  blocks.map(([type, text]) => ({ type, text, tone: 'same' as const }));

export function ScriptBlocks({ blocks }: { blocks: ScriptBlock[] }) {
  return <ScriptBlocksToned lines={sameTone(blocks)} />;
}

export function ScriptSceneText({ scene, className = '' }: { scene: ScriptScene; className?: string }) {
  return (
    <div className={`font-mono text-[12.5px] leading-[1.45] text-zinc-200 ${className}`}>
      <ScriptBlocks blocks={scene.blocks} />
    </div>
  );
}

/**
 * Block-level diff of two retained streams for the update review: the OLD pane
 * shows removed blocks struck through in place; the NEW pane highlights added
 * blocks. Uses `diffArrays` with a tuple comparator (block arrays are never
 * reference-equal across imports).
 */
export function diffScriptBlocks(oldBlocks: ScriptBlock[], newBlocks: ScriptBlock[]): { old: TonedBlock[]; new: TonedBlock[] } {
  const changes = diffArrays(oldBlocks, newBlocks, {
    comparator: (a, b) => a[0] === b[0] && a[1] === b[1],
  });
  const oldLines: TonedBlock[] = [];
  const newLines: TonedBlock[] = [];
  for (const change of changes) {
    const blocks = change.value as ScriptBlock[];
    if (change.added) {
      for (const [type, text] of blocks) newLines.push({ type, text, tone: 'added' });
    } else if (change.removed) {
      for (const [type, text] of blocks) oldLines.push({ type, text, tone: 'removed' });
    } else {
      for (const [type, text] of blocks) {
        oldLines.push({ type, text, tone: 'same' });
        newLines.push({ type, text, tone: 'same' });
      }
    }
  }
  return { old: oldLines, new: newLines };
}
