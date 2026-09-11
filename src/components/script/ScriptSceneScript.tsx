import React from 'react';
import { diffArrays, diffWords } from 'diff';
import type { ScriptBlock, ScriptBlockType, ScriptInline, ScriptScene } from '../../types';

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
  /** Inline bold/italic/underline runs, when the source carried them. */
  runs?: ScriptInline[];
  /** Intra-line segments: a changed heading (INT-EXT · set · day-night) or a
   *  word-level body diff. `user` = your in-app edit (blue), `incoming` = the
   *  new script (green), `removed`/`added` = word-level tokens (red/green). */
  parts?: { text: string; change?: 'user' | 'incoming' | 'removed' | 'added' }[];
}

// Diff backgrounds carry the meaning; TEXT STAYS NEUTRAL (never tinted). Line-
// level and word-level changes share the same intensity (one green, one red).
const TONE_CLASS_DARK: Record<BlockTone, string> = {
  same: '',
  added: 'bg-emerald-500/25',
  removed: 'bg-red-500/25 line-through decoration-red-400/60',
  /** Your in-app edit (not the imported baseline) — blue marker. */
  changed: 'bg-blue-500/25',
};

const TONE_CLASS_LIGHT: Record<BlockTone, string> = {
  same: '',
  added: 'bg-emerald-500/25',
  removed: 'bg-red-500/25 line-through decoration-red-400/60',
  changed: 'bg-blue-500/25',
};

const TONE_CLASSES: Record<ScriptTheme, Record<BlockTone, string>> = {
  dark: TONE_CLASS_DARK,
  light: TONE_CLASS_LIGHT,
};

/** Inline-part colors per theme: heading edits (user/incoming) + word-level
 *  body diff tokens (removed/added). Backgrounds only — text stays neutral. */
const PART_CLASSES: Record<ScriptTheme, Record<'user' | 'incoming' | 'removed' | 'added', string>> = {
  dark: {
    user: 'bg-blue-500/25',
    incoming: 'bg-emerald-500/25',
    removed: 'bg-red-500/25 line-through decoration-red-400/60',
    added: 'bg-emerald-500/25',
  },
  light: {
    user: 'bg-blue-500/25',
    incoming: 'bg-emerald-500/25',
    removed: 'bg-red-500/25 line-through decoration-red-400/60',
    added: 'bg-emerald-500/25',
  },
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

/** Render styled inline runs (bold/italic/underline), preserving search
 *  highlights inside each run. */
function InlineRuns({ runs, highlight, theme }: { runs: ScriptInline[]; highlight?: string; theme: ScriptTheme }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: React.ReactNode = <Highlighted text={r.text} query={highlight} theme={theme} />;
        if (r.underline) node = <u>{node}</u>;
        if (r.italic) node = <em>{node}</em>;
        if (r.bold) node = <strong>{node}</strong>;
        return <React.Fragment key={i}>{node}</React.Fragment>;
      })}
    </>
  );
}

function BlockLine({ type, text, tone, parts, runs, theme, highlight, sceneNumber }: TonedBlock & { theme: ScriptTheme; highlight?: string; sceneNumber?: string }) {
  const toneCls = TONE_CLASSES[theme][tone];
  const partCls = PART_CLASSES[theme];
  const partsNode = parts && parts.length > 0
    ? (
      <>
        {parts.map((p, i) => (
          <span key={i} data-change={p.change} className={p.change ? `${partCls[p.change]} rounded px-0.5` : ''}>
            <Highlighted text={p.text} query={highlight} theme={theme} />
          </span>
        ))}
      </>
    )
    : null;
  const content = partsNode ?? (runs && runs.length > 0
    ? <InlineRuns runs={runs} highlight={highlight} theme={theme} />
    : <Highlighted text={text} query={highlight} theme={theme} />);
  switch (type) {
    case 'page_break':
      return <div className={`my-2 border-t border-dashed ${theme === 'light' ? 'border-zinc-400' : 'border-zinc-600/60'}`} />;
    case 'heading':
      return (
        <div className={`relative mt-4 font-bold uppercase tracking-wide ${toneCls}`}>
          {sceneNumber && (
            <span className={`absolute right-full mr-3 font-normal normal-case ${theme === 'light' ? 'text-zinc-400' : 'text-zinc-500'}`}>{sceneNumber}</span>
          )}
          {content}
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
  blocks.map(([type, text, runs]) => ({ type, text, tone: 'same' as const, runs }));

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
    <div className={`font-mono ${fontClass} ${theme === 'light' ? 'font-medium text-zinc-950' : 'text-zinc-200'} ${className}`}>
      <ScriptBlocks blocks={scene.blocks} theme={theme} highlight={highlight} sceneNumber={sceneNumber} />
    </div>
  );
}

/** One aligned review row: the left (current) and/or right (incoming) block at
 *  the same vertical position (roadmap 128). A side is absent when the block
 *  was added/removed, so the grid leaves an empty filler cell. */
export interface AlignedBlockRow {
  left?: TonedBlock;
  right?: TonedBlock;
}

/** Tuple comparator for review diffs. Notably it does NOT force headings equal:
 *  a changed heading is a normal removed+added run and the pairing below puts it
 *  on one aligned row — forcing it equal made jsdiff emit only the NEW text for
 *  both panes. */
const reviewBlockEqual = (a: ScriptBlock, b: ScriptBlock): boolean =>
  a[0] === b[0] && a[1] === b[1] && JSON.stringify(a[2] ?? null) === JSON.stringify(b[2] ?? null);

/** A paired block at/above this similarity gets word-level marks; below it the
 *  block reads better as a whole-line replacement (red left / green right). */
export const WORD_DIFF_MIN_SIMILARITY = 0.5;

/**
 * Block-level diff of two retained streams, returned as **vertically aligned
 * rows** (roadmap 128) — the update review renders one row per entry so an
 * insert/delete leaves a blank filler cell instead of drifting the panes.
 *
 * A `diffArrays` replacement comes out as a removed run then an added run; like
 * GitHub's split view / VS Code, we **pair those runs line-by-line** so a 1-for-1
 * replacement renders side-by-side on one row (not "all removed" then "all
 * added"), and only the surplus lines of the longer side get a filler cell.
 * `diffArrays` segments are never reference-equal across imports, hence the
 * tuple comparator.
 */
export function alignScriptBlocks(oldBlocks: ScriptBlock[], newBlocks: ScriptBlock[]): AlignedBlockRow[] {
  const changes = diffArrays(oldBlocks, newBlocks, { comparator: reviewBlockEqual });
  const rows: AlignedBlockRow[] = [];
  let removed: TonedBlock[] = [];
  let added: TonedBlock[] = [];
  const flush = () => {
    const n = Math.max(removed.length, added.length);
    for (let i = 0; i < n; i++) rows.push({ left: removed[i], right: added[i] });
    removed = [];
    added = [];
  };
  for (const change of changes) {
    const blocks = change.value as ScriptBlock[];
    if (change.removed) {
      if (added.length) flush(); // an added run followed by a removed run
      for (const [type, text, runs] of blocks) removed.push({ type, text, tone: 'removed', runs });
    } else if (change.added) {
      for (const [type, text, runs] of blocks) added.push({ type, text, tone: 'added', runs });
    } else {
      flush();
      for (const [type, text, runs] of blocks) {
        rows.push({ left: { type, text, tone: 'same', runs }, right: { type, text, tone: 'same', runs } });
      }
    }
  }
  flush();
  // Word-level marking on paired (replaced) lines ONLY when the block is mostly
  // unchanged; a mostly-rewritten block stays whole-line (red left / green
  // right) instead of a scatter of changed tokens — like IDE split diffs.
  for (const row of rows) {
    const { left, right } = row;
    if (!left || !right || left.type === 'heading' || left.tone === 'same') continue;
    const parts = diffWords(left.text, right.text);
    let unchanged = 0;
    let changed = 0;
    for (const c of parts) {
      if (c.added || c.removed) changed += c.count ?? 0;
      else unchanged += c.count ?? 0;
    }
    if (unchanged + changed === 0 || unchanged / (unchanged + changed) < WORD_DIFF_MIN_SIMILARITY) continue;
    left.parts = parts.filter(c => !c.added).map(c => ({ text: c.value, change: c.removed ? 'removed' as const : undefined }));
    right.parts = parts.filter(c => !c.removed).map(c => ({ text: c.value, change: c.added ? 'added' as const : undefined }));
    left.tone = 'same';
    right.tone = 'same';
  }
  return rows;
}

/** Render a single review line (dark theme) — used by the aligned review grid. */
export function ScriptBlockLine({ block }: { block: TonedBlock }) {
  return <BlockLine {...block} theme="dark" />;
}
