import React from 'react';
import { diffArrays } from 'diff';
import type { ScriptBlock, ScriptBlockType, ScriptScene } from '../../types';

/**
 * Screenplay renderer (roadmap 123 Phase 1, reused by 38's update review) —
 * renders retained `ScriptScene` blocks in proper screenplay format: Courier,
 * standard indents, dual dialogue columns, transitions right-aligned. Styles
 * only; the caller supplies the block data.
 *
 * Two themes: `dark` (default — the diff review modal) and `light` (the Script
 * sub-tab and the portable pane, which sit on the light Breakdown surface).
 * ONE renderer, never a fork. `fontClass` lets a surface pick its reading size
 * (the Script sub-tab reads larger than the narrow pane); `highlight` wraps
 * case-insensitive search matches inline.
 */

export type ScriptTheme = 'dark' | 'light';

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

const TONE_CLASS_DARK: Record<BlockTone, string> = {
  same: '',
  added: 'bg-emerald-500/15',
  removed: 'bg-red-500/15 text-red-300/90 line-through decoration-red-400/60',
  /** Your in-app edit (not the imported baseline) — blue marker. */
  changed: 'bg-blue-500/15 text-blue-200',
};

const TONE_CLASS_LIGHT: Record<BlockTone, string> = {
  same: '',
  added: 'bg-emerald-500/15',
  removed: 'bg-red-500/10 text-red-700/90 line-through decoration-red-400/60',
  changed: 'bg-blue-500/10 text-blue-800',
};

const TONE_CLASSES: Record<ScriptTheme, Record<BlockTone, string>> = {
  dark: TONE_CLASS_DARK,
  light: TONE_CLASS_LIGHT,
};

/** Heading-part change colors per theme (user edit vs incoming script). */
const PART_CLASSES: Record<ScriptTheme, { user: string; incoming: string }> = {
  dark: { user: 'text-blue-300 bg-blue-500/20', incoming: 'text-emerald-300 bg-emerald-500/20' },
  light: { user: 'text-blue-800 bg-blue-500/20', incoming: 'text-emerald-800 bg-emerald-500/20' },
};

const MARK_CLASSES: Record<ScriptTheme, string> = {
  dark: 'rounded-[2px] bg-yellow-400/40 text-inherit',
  light: 'rounded-[2px] bg-yellow-300/80 text-zinc-900',
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wrap case-insensitive occurrences of `query` in a `<mark>`. */
function Highlighted({ text, query, theme }: { text: string; query?: string; theme: ScriptTheme }) {
  if (!query || !text) return <>{text}</>;
  const re = new RegExp(`(${escapeRegExp(query)})`, 'ig');
  const parts = text.split(re);
  const q = query.toLowerCase();
  const markCls = MARK_CLASSES[theme];
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q
          ? <mark key={i} className={markCls}>{p}</mark>
          : <React.Fragment key={i}>{p}</React.Fragment>,
      )}
    </>
  );
}

function BlockLine({ type, text, tone, parts, theme, highlight, sceneNumber }: TonedBlock & { theme: ScriptTheme; highlight?: string; sceneNumber?: string }) {
  const toneCls = TONE_CLASSES[theme][tone];
  const partCls = PART_CLASSES[theme];
  const content = <Highlighted text={text} query={highlight} theme={theme} />;
  switch (type) {
    case 'page_break':
      return <div className={`my-2 border-t border-dashed ${theme === 'light' ? 'border-zinc-400' : 'border-zinc-600/60'}`} />;
    case 'heading':
      return (
        <div className={`relative mt-4 font-bold uppercase tracking-wide ${toneCls}`}>
          {sceneNumber && (
            <span className={`absolute right-full mr-3 font-normal normal-case ${theme === 'light' ? 'text-zinc-400' : 'text-zinc-500'}`}>{sceneNumber}</span>
          )}
          {parts
            ? parts.map((p, i) => (
                <span
                  key={i}
                  className={
                    p.change === 'user' ? `${partCls.user} rounded px-0.5`
                      : p.change === 'incoming' ? `${partCls.incoming} rounded px-0.5`
                        : ''
                  }
                >
                  <Highlighted text={p.text} query={highlight} theme={theme} />
                </span>
              ))
            : content}
        </div>
      );
    case 'character':
      return <div className={`mt-3 pl-[36%] uppercase ${toneCls}`}>{content}</div>;
    case 'parenthetical':
      return <div className={`pl-[30%] pr-[26%] italic ${toneCls}`}>{content}</div>;
    case 'dialogue':
    case 'dual_left':
    case 'dual_right':
      return <div className={`pl-[22%] pr-[26%] ${toneCls}`}>{content}</div>;
    case 'transition':
      return <div className={`mt-3 text-right uppercase ${toneCls}`}>{content}</div>;
    case 'shot':
      return <div className={`mt-3 uppercase ${toneCls}`}>{content}</div>;
    case 'action':
    default:
      return <div className={`mt-2 ${toneCls}`}>{content}</div>;
  }
}

const DUAL_RUN_TYPES = new Set<ScriptBlockType>(['character', 'parenthetical', 'dual_left', 'dual_right']);

/** Split a run of dual blocks into left/right columns at the character cue
 *  immediately before the first `dual_right`. */
function DualColumns({ run, theme, highlight }: { run: TonedBlock[]; theme: ScriptTheme; highlight?: string }) {
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
      <div>{left.map((b, i) => <BlockLine key={i} {...b} theme={theme} highlight={highlight} />)}</div>
      <div>{right.map((b, i) => <BlockLine key={i} {...b} theme={theme} highlight={highlight} />)}</div>
    </div>
  );
}

export function ScriptBlocksToned({ lines, theme = 'dark', highlight, sceneNumber }: { lines: TonedBlock[]; theme?: ScriptTheme; highlight?: string; sceneNumber?: string }) {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const block = lines[i];
    if (block.type === 'dual_left' || block.type === 'dual_right') {
      const run: TonedBlock[] = [];
      while (i < lines.length && DUAL_RUN_TYPES.has(lines[i].type)) { run.push(lines[i]); i++; }
      out.push(<DualColumns key={`dual-${i}`} run={run} theme={theme} highlight={highlight} />);
    } else {
      out.push(<BlockLine key={i} {...block} theme={theme} highlight={highlight} sceneNumber={block.type === 'heading' ? sceneNumber : undefined} />);
      i++;
    }
  }
  return <>{out}</>;
}

const sameTone = (blocks: ScriptBlock[]): TonedBlock[] =>
  blocks.map(([type, text]) => ({ type, text, tone: 'same' as const }));

export function ScriptBlocks({ blocks, theme = 'dark', highlight, sceneNumber }: { blocks: ScriptBlock[]; theme?: ScriptTheme; highlight?: string; sceneNumber?: string }) {
  return <ScriptBlocksToned lines={sameTone(blocks)} theme={theme} highlight={highlight} sceneNumber={sceneNumber} />;
}

export function ScriptSceneText({ scene, className = '', theme = 'dark', fontClass = 'text-[12.5px] leading-[1.45]', highlight, sceneNumber }: {
  scene: ScriptScene;
  className?: string;
  theme?: ScriptTheme;
  /** Reading size/leading — e.g. the Script sub-tab passes a larger class. */
  fontClass?: string;
  highlight?: string;
  /** Rendered inline on the scene heading (Final-Draft-style). */
  sceneNumber?: string;
}) {
  return (
    <div className={`font-mono ${fontClass} ${theme === 'light' ? 'text-zinc-950' : 'text-zinc-200'} ${className}`}>
      <ScriptBlocks blocks={scene.blocks} theme={theme} highlight={highlight} sceneNumber={sceneNumber} />
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
