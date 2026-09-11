import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, FileText, List } from 'lucide-react';
import { useProject } from '../store';
import { useDialog } from './Dialog';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';
import Checkbox from './Checkbox';
import { diffScripts, commitScriptDiff, defaultDecision, parseSceneHeading, buildCastIdMap, firstFreeCastId, collectUnknownFromValues, applyHeadingMapping, buildHeadingMappingUpdate, knownIntExtValues, knownDayNightValues } from '../lib/import';
import type { HeadingMapping } from '../lib/import';
import HeadingValueMapper from './import/HeadingValueMapper';
import type { DiffDecision, ImportResult, SceneDiffEntry, SceneFieldDiff } from '../lib/import';
import { scriptSceneBlocks } from '../lib/script';
import { ScriptBlocksToned, diffScriptBlocks } from './script/ScriptSceneScript';
import type { TonedBlock } from './script/ScriptSceneScript';
import { CastAssignmentTable, CategoryChecklist } from './import/ImportReviewControls';
import type { ImportCharacter } from '../lib/import';
import type { ScriptBlock } from '../types';

/**
 * Script update review (roadmap 38) — a SEPARATE, keyboard-fast modal.
 * One-change-at-a-time review → a final CONFIRMATION list (changed entries only,
 * showing what each decision keeps/takes) → Apply (with a warning dialog).
 * The screenplay renders via the shared `ScriptSceneScript` renderer (also 123
 * Phase 1). Nothing here duplicates the import path.
 */

const OPTIONS: Record<string, { accept: { decision: DiffDecision; label: string }; keep: { decision: DiffDecision; label: string } }> = {
  modified: { accept: { decision: 'apply', label: 'Take script' }, keep: { decision: 'keep', label: 'Keep yours' } },
  added: { accept: { decision: 'add', label: 'Add scene' }, keep: { decision: 'skip', label: 'Skip' } },
  removed: { accept: { decision: 'remove', label: 'Remove' }, keep: { decision: 'keep', label: 'Keep scene' } },
};

const STATUS_STYLE: Record<string, string> = {
  modified: 'bg-amber-900/50 text-amber-300',
  added: 'bg-emerald-900/50 text-emerald-300',
  removed: 'bg-red-900/50 text-red-300',
};

type View = 'review' | 'confirm' | 'setup';

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 px-1 rounded border border-zinc-600 bg-zinc-800 text-[9px] text-zinc-300 font-mono leading-tight">{children}</kbd>;
}

function FieldStrip({ fields, keeps, onToggle }: { fields: SceneFieldDiff[]; keeps?: Set<string>; onToggle?: (key: string) => void }) {
  const nonBody = fields.filter(f => f.key !== 'body');
  if (nonBody.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {nonBody.map(f => {
        const keep = keeps?.has(f.key) ?? false;
        return (
          <Checkbox
            key={f.key}
            variant="plain"
            block
            checked={!keep}
            onChange={() => onToggle?.(f.key)}
            disabled={!onToggle}
            label={
              <span className="flex flex-wrap items-center gap-2 text-[11px] min-w-0">
                <span className="uppercase tracking-wider text-zinc-500 w-16 shrink-0">{f.key}</span>
                {f.kind === 'items' ? (
                  <span className="flex flex-wrap gap-1">
                    {f.removed.map(x => <span key={`r-${x}`} className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 line-through">{x}</span>)}
                    {f.added.map(x => <span key={`a-${x}`} className="px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300">{x}</span>)}
                  </span>
                ) : (
                  <span>
                    <span className="text-red-300/80 line-through">{f.before || '—'}</span>
                    <span className="mx-1 text-zinc-600">→</span>
                    <span className="text-emerald-300/90">{f.after || '—'}</span>
                  </span>
                )}
                {onToggle && <span className="text-[9px] text-zinc-600">{keep ? 'keep mine' : 'take script'}</span>}
              </span>
            }
          />
        );
      })}
    </div>
  );
}

function Pane({ title, lines, scrollRef, onScroll }: {
  title: string;
  lines: TonedBlock[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      <div ref={scrollRef} onScroll={onScroll} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 h-[320px] overflow-y-auto">
        {lines.length > 0
          ? <div className="font-mono text-[12.5px] leading-[1.45] text-zinc-200"><ScriptBlocksToned lines={lines} /></div>
          : <p className="text-zinc-600 text-xs italic">No retained screenplay for this scene.</p>}
      </div>
    </div>
  );
}

function DecisionButtons({ status, decision, onDecide }: { status: string; decision: DiffDecision; onDecide: (d: DiffDecision) => void }) {
  const opts = OPTIONS[status];
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onDecide(opts.keep.decision)}
        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${decision === opts.keep.decision ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
      >
        {opts.keep.label}
      </button>
      <button
        onClick={() => onDecide(opts.accept.decision)}
        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${decision === opts.accept.decision ? (status === 'removed' ? 'bg-red-800 text-white' : 'bg-blue-800 text-white') : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
      >
        {opts.accept.label}
      </button>
    </div>
  );
}

type HeadingPart = { text: string; change?: 'user' | 'incoming' };
type HeadingValues = { intExt?: string; set?: string; dayNight?: string };

const normHeading = (t?: string) => (t || '').toUpperCase().replace(/[^A-Z0-9\u0370-\u03ff]/g, '');

/** Split a heading into diffable parts (INT/EXT · dot · set · day/night), each
 *  marked when it differs from `base` — so only the changed piece is colored. */
function headingParts(values: HeadingValues, base: HeadingValues, change: 'user' | 'incoming'): HeadingPart[] {
  const parts: HeadingPart[] = [];
  if (values.intExt) parts.push({ text: values.intExt, change: normHeading(values.intExt) !== normHeading(base.intExt) ? change : undefined });
  parts.push({ text: '. ' });
  if (values.set) parts.push({ text: values.set, change: normHeading(values.set) !== normHeading(base.set) ? change : undefined });
  if (values.dayNight) {
    parts.push({ text: ' - ' });
    parts.push({ text: values.dayNight, change: normHeading(values.dayNight) !== normHeading(base.dayNight) ? change : undefined });
  }
  return parts;
}

function replaceHeading(blocks: ScriptBlock[], parts: HeadingPart[]): ScriptBlock[] {
  const text = parts.map(p => p.text).join('');
  const copy = blocks.map(b => [...b] as ScriptBlock);
  const idx = copy.findIndex(b => b[0] === 'heading');
  if (idx >= 0) copy[idx] = ['heading', text];
  else copy.unshift(['heading', text]);
  return copy;
}

/** Current-scene screenplay lines: the retained body with the heading swapped
 *  for the CURRENT scene fields (so in-app INT/EXT/set/day-night edits show). */
function currentSceneLines(entry: SceneDiffEntry, doc: import('../types').ScriptDocument | undefined): { lines: ScriptBlock[]; parts: HeadingPart[] } {
  const blocks = entry.oldScene ? scriptSceneBlocks(doc, entry.oldScene.sceneNumber) : [];
  const s = entry.oldScene;
  if (!s) return { lines: blocks, parts: [] };
  const baseline = parseSceneHeading(blocks.find(b => b[0] === 'heading')?.[1] || '') || {};
  const parts = headingParts(s, baseline, 'user');
  return { lines: replaceHeading(blocks, parts), parts };
}

export default function ScriptUpdateModal({ result, fileName, onClose }: { result: ImportResult; fileName: string; onClose: () => void }) {
  const { state, dispatch } = useProject();
  const dialog = useDialog();
  const project = state.present;
  // Custom/localized heading values are mapped at APPLY time, and only for the
  // odd values that survive the user's decisions (roadmap 127).
  const [mappingPrompt, setMappingPrompt] = useState<{ intExt: string[]; dayNight: string[] } | null>(null);

  const castNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of project.castMembers || []) map.set(String(c.id), c.name);
    return map;
  }, [project.castMembers]);

  const diff = useMemo(() => diffScripts(project.scenes, result.scenes, {
    castNameById,
    customCategories: project.customCategories || [],
    oldBody: project.scriptDocument,
    newBody: result.script,
  }), [project.scenes, project.customCategories, project.scriptDocument, castNameById, result]);

  const changeIndices = useMemo(
    () => diff.entries.map((e, i) => (e.status === 'unchanged' ? -1 : i)).filter(i => i >= 0),
    [diff],
  );

  const [decisions, setDecisions] = useState<DiffDecision[]>(() => diff.entries.map(defaultDecision));
  const [decided, setDecided] = useState<Set<number>>(() => new Set());
  const [history, setHistory] = useState<number[]>([]);
  const [view, setView] = useState<View>(changeIndices.length ? 'review' : 'confirm');
  const [fieldKeeps, setFieldKeeps] = useState<Record<number, Set<string>>>({});

  const [castOrder, setCastOrder] = useState<ImportCharacter[]>(() =>
    [...result.characters].sort((a, b) => b.scenes.length - a.scenes.length));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => new Set(result.unknownCategories));

  const paneARef = useRef<HTMLDivElement>(null);
  const paneBRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const syncScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const src = e.currentTarget;
    const dst = src === paneARef.current ? paneBRef.current : paneARef.current;
    if (!dst || syncingRef.current) return;
    syncingRef.current = true;
    dst.scrollTop = src.scrollTop;
    dst.scrollLeft = src.scrollLeft;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  const queue = useMemo(() => changeIndices.filter(i => !decided.has(i)), [changeIndices, decided]);
  const currentIndex = queue[0];
  const entry: SceneDiffEntry | undefined = currentIndex !== undefined ? diff.entries[currentIndex] : undefined;
  const total = changeIndices.length;
  const reviewed = decided.size;

  // Review is done → the final confirmation list.
  useEffect(() => {
    if (view === 'review' && total > 0 && queue.length === 0) setView('confirm');
  }, [view, total, queue.length]);

  useEffect(() => {
    if (paneARef.current) paneARef.current.scrollTop = 0;
    if (paneBRef.current) paneBRef.current.scrollTop = 0;
  }, [currentIndex]);

  const decide = useCallback((index: number, decision: DiffDecision) => {
    setDecisions(prev => prev.map((d, i) => (i === index ? decision : d)));
    setDecided(prev => { const next = new Set(prev); next.add(index); return next; });
    setHistory(h => (h.includes(index) ? h : [...h, index]));
  }, []);

  const decideCurrent = useCallback((decision: DiffDecision) => {
    if (currentIndex === undefined) return;
    decide(currentIndex, decision);
  }, [currentIndex, decide]);

  const goBack = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setDecided(prev => { const next = new Set(prev); next.delete(last); return next; });
      return h.slice(0, -1);
    });
    setView('review');
  }, []);

  const toggleFieldKeep = useCallback((index: number, key: string) => {
    setFieldKeeps(prev => {
      const cur = new Set(prev[index] || []);
      if (cur.has(key)) cur.delete(key); else cur.add(key);
      return { ...prev, [index]: cur };
    });
  }, []);

  const acceptAllRemaining = useCallback(() => {
    const next = new Set(decided);
    const nextDecisions = decisions.slice();
    for (const i of changeIndices) {
      if (next.has(i)) continue;
      nextDecisions[i] = OPTIONS[diff.entries[i].status].accept.decision;
      next.add(i);
    }
    setDecisions(nextDecisions);
    setDecided(next);
    setView('confirm');
  }, [decided, decisions, changeIndices, diff]);

  const report = useMemo(() => {
    const updated: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    diff.entries.forEach((e, i) => {
      const d = decisions[i];
      if (e.status === 'modified' && d === 'apply') updated.push(e.sceneNumber);
      else if (e.status === 'added' && d === 'add') added.push(e.sceneNumber);
      else if (e.status === 'removed' && d === 'remove') removed.push(e.sceneNumber);
    });
    return { updated, added, removed, renames: diff.castRenames };
  }, [diff, decisions]);
  const mutationCount = report.updated.length + report.added.length + report.removed.length;

  const startId = useMemo(() => firstFreeCastId(project.castMembers || []), [project.castMembers]);
  // Reuse existing cast ids by name — a re-import must never duplicate a member.
  const castAssignments = useMemo(
    () => buildCastIdMap(castOrder, project.castMembers || []),
    [castOrder, project.castMembers],
  );

  const commitNow = useCallback((headingValues?: { intExt?: Record<string, string>; dayNight?: Record<string, string> }) => {
    commitScriptDiff({
      dispatch,
      result,
      entries: diff.entries,
      decisions,
      castIdMap: castAssignments,
      newCustomCategories: [...selectedCategories],
      existingCastMembers: project.castMembers || [],
      castRenames: diff.castRenames,
      fieldKeeps: diff.entries.map((_, i) => fieldKeeps[i]),
      headingValues,
    });
    onClose();
  }, [dispatch, result, diff, decisions, castAssignments, selectedCategories, project.castMembers, onClose, fieldKeeps]);

  const runApply = useCallback(async () => {
    const parts: string[] = [];
    if (report.updated.length) parts.push(`update ${report.updated.length} scene${report.updated.length === 1 ? '' : 's'} in place`);
    if (report.added.length) parts.push(`add ${report.added.length} new scene${report.added.length === 1 ? '' : 's'} to the boneyard`);
    if (report.removed.length) parts.push(`remove ${report.removed.length} scene${report.removed.length === 1 ? '' : 's'} (to Trash, restorable)`);
    if (report.renames.length) parts.push(`rename ${report.renames.map(r => `${r.from} → ${r.to}`).join(', ')}`);
    if (diff.pageDelta !== 0) parts.push(`page count ${diff.pageDelta > 0 ? '+' : ''}${diff.pageDelta}`);
    const ok = await dialog.confirm({
      title: 'Update the script?',
      message: `This will ${parts.join(', ') || 'change nothing'}. Existing scene ids (and their schedule) are kept. One undo step.`,
      danger: report.removed.length > 0,
    });
    if (!ok) return;

    // Prompt for custom/localized heading values in EVERY scene that survives
    // the update — accepted ("take/add") AND kept ones (their value remains).
    const finalScenes: { intExt?: string; dayNight?: string }[] = [];
    diff.entries.forEach((e, i) => {
      const d = decisions[i] ?? defaultDecision(e);
      let sc: { intExt?: string; dayNight?: string } | undefined;
      if (e.status === 'modified') sc = d === 'apply' ? e.newScene : e.oldScene;
      else if (e.status === 'added') sc = d === 'add' ? e.newScene : undefined;
      else if (e.status === 'removed') sc = d === 'remove' ? undefined : e.oldScene;
      else sc = e.oldScene; // unchanged
      if (sc) finalScenes.push(sc);
    });
    const unknown = collectUnknownFromValues(finalScenes, project);
    if (unknown.intExt.length || unknown.dayNight.length) {
      setMappingPrompt(unknown);
      return;
    }
    commitNow();
  }, [dialog, report, diff, decisions, project, commitNow]);

  const confirmHeadingMapping = useCallback((mapping: HeadingMapping) => {
    const applied = applyHeadingMapping(result, project, mapping);
    dispatch({ type: 'UPDATE_PROJECT', payload: buildHeadingMappingUpdate(project, applied) });
    const hv = {
      intExt: { ...(applied.aliases.intExt || {}) },
      dayNight: { ...(applied.aliases.dayNight || {}) },
    };
    for (const v of applied.addedIntExt) hv.intExt[v] = v;
    for (const v of applied.addedDayNight) hv.dayNight[v] = v;
    setMappingPrompt(null);
    commitNow(hv);
  }, [result, project, dispatch, commitNow]);

  // Keyboard: →/A accept · ←/K keep · ⌫ previous · L toggle (review) · S setup · ⌘⏎ apply.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (view !== 'setup' && mutationCount > 0) runApply();
        return;
      }
      if (e.key.toLowerCase() === 's' && view !== 'setup') { e.preventDefault(); setView('setup'); return; }
      if (e.key.toLowerCase() === 'l' && view === 'review' && entry) { e.preventDefault(); acceptAllRemaining(); return; }
      if (view !== 'review' || !entry) return;
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'a') { e.preventDefault(); decideCurrent(OPTIONS[entry.status].accept.decision); }
      else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'k') { e.preventDefault(); decideCurrent(OPTIONS[entry.status].keep.decision); }
      else if ((e.key === 'Backspace' || e.key.toLowerCase() === 'b') && history.length > 0) { e.preventDefault(); goBack(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, view, decideCurrent, goBack, history.length, mutationCount, runApply, acceptAllRemaining]);

  const renderPanes = (e: SceneDiffEntry, index: number) => {
    const current = currentSceneLines(e, project.scriptDocument);
    const newValues: HeadingValues = e.newScene ? { intExt: e.newScene.intExt, set: e.newScene.set, dayNight: e.newScene.dayNight } : {};
    const newParts = e.newScene ? headingParts(newValues, e.oldScene || {}, 'incoming') : [];
    const newLines = replaceHeading(e.newScene ? scriptSceneBlocks(result.script, e.newScene.sceneNumber) : [], newParts);
    const panes = diffScriptBlocks(current.lines, newLines);
    // Granular headings: only the changed part(s) are colored (blue = yours,
    // green = the incoming script's). The rest of the diff stays line-level.
    const oldHeading = panes.old.find(l => l.type === 'heading');
    if (oldHeading) { oldHeading.tone = 'same'; oldHeading.parts = current.parts; }
    const newHeading = panes.new.find(l => l.type === 'heading');
    if (newHeading) { newHeading.tone = 'same'; newHeading.parts = newParts; }
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {e.status !== 'added' && <Pane title="Current (your project)" lines={panes.old} scrollRef={paneARef} onScroll={syncScroll} />}
          {e.status !== 'removed' && <Pane title="Incoming (new script)" lines={panes.new} scrollRef={paneBRef} onScroll={syncScroll} />}
        </div>
        {e.fields.some(f => f.key !== 'body') && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <FieldStrip fields={e.fields} keeps={fieldKeeps[index]} onToggle={key => toggleFieldKeep(index, key)} />
          </div>
        )}
      </>
    );
  };

  const changed = useMemo(() => diff.entries.map((e, i) => ({ e, i })).filter(({ e }) => e.status !== 'unchanged'), [diff]);

  const body = () => {
    if (view === 'setup') {
      return (
        <div className="space-y-4">
          <CategoryChecklist
            title="New Categories"
            hint="These categories are new in this file."
            items={result.unknownCategories.map(cat => ({ key: cat, label: cat }))}
            selected={selectedCategories}
            onToggle={(key) => setSelectedCategories(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
          />
          <CastAssignmentTable castOrder={castOrder} onReorder={setCastOrder} startId={startId} ids={castOrder.map(ch => castAssignments.get(ch.name))} />
        </div>
      );
    }

    if (view === 'confirm') {
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
            <span className="text-amber-300"><b>{mutationCount}</b> to apply</span>
            <span className="text-zinc-400">{diff.summary.unchanged} unchanged (hidden)</span>
            {diff.pageDelta !== 0 && <span className="text-zinc-400">page count {diff.pageDelta > 0 ? '+' : ''}{diff.pageDelta}</span>}
            {diff.castRenames.length > 0 && <span className="text-zinc-400">rename {diff.castRenames.map(r => `${r.from}→${r.to}`).join(', ')}</span>}
          </div>
          <div className="rounded-lg border border-zinc-800 overflow-hidden divide-y divide-zinc-800/70 max-h-[440px] overflow-y-auto">
            {changed.map(({ e, i }) => (
              <div key={`${e.status}-${e.sceneNumber}-${i}`} className="bg-zinc-950">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[e.status]}`}>{e.status === 'added' ? 'new' : e.status}</span>
                  <span className="text-zinc-300 text-xs font-mono w-12 shrink-0">{e.sceneNumber}</span>
                  <span className="text-zinc-400 text-xs truncate flex-1">{e.newScene?.set || e.oldScene?.set || ''}</span>
                  <DecisionButtons status={e.status} decision={decisions[i]} onDecide={d => decide(i, d)} />
                </div>
                <div className="px-3 pb-2">
                  {e.fields.length > 0
                    ? <FieldStrip fields={e.fields} keeps={fieldKeeps[i]} onToggle={key => toggleFieldKeep(i, key)} />
                    : <p className="text-zinc-600 text-[11px] italic">{e.status === 'added' ? 'New scene' : 'Remove this scene'}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // review
    if (!entry) {
      return <div className="text-center py-10 text-zinc-500 text-sm">Review complete.</div>;
    }
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[entry.status]}`}>
            {entry.status === 'added' ? 'New scene' : entry.status}
          </span>
          <span className="text-zinc-200 text-sm font-mono">{entry.sceneNumber}</span>
          {entry.splitOf && <span className="text-[11px] text-purple-300">split of {entry.splitOf}</span>}
          {entry.mergedInto && <span className="text-[11px] text-purple-300">merged into {entry.mergedInto}</span>}
        </div>
        {renderPanes(entry, currentIndex!)}
      </div>
    );
  };

  if (mappingPrompt) {
    return (
      <HeadingValueMapper
        unknown={mappingPrompt}
        knownIntExt={knownIntExtValues(project)}
        knownDayNight={knownDayNightValues(project)}
        onCancel={onClose}
        onConfirm={confirmHeadingMapping}
      />
    );
  }

  const footer = (
    <ModalFooter>
      <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
      {view === 'confirm' && (
        <ModalFooterButton variant="ghost" onClick={() => setView('review')}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </ModalFooterButton>
      )}
      {view === 'review' && entry && (
        <ModalFooterButton variant="hero" onClick={acceptAllRemaining}>
          Accept all
        </ModalFooterButton>
      )}
      {view === 'confirm' && (
        <ModalFooterButton variant="hero" onClick={runApply} disabled={mutationCount === 0}>
          <Check className="w-3.5 h-3.5" /> Apply {mutationCount}
        </ModalFooterButton>
      )}
      {view === 'setup' && (
        <ModalFooterButton variant="hero" onClick={() => setView('confirm')}>Done</ModalFooterButton>
      )}
    </ModalFooter>
  );

  return (
    <Modal open onClose={onClose} title={`Update Script — ${fileName}`} icon={<FileText className="w-4 h-4" />} width="max-w-5xl" footer={footer}>
      <div className="px-5 py-4 space-y-3">
        {view !== 'setup' && total > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round((reviewed / total) * 100)}%` }} />
            </div>
            <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">{reviewed} / {total}</span>
          </div>
        )}
        {body()}

        {/* Body-level controls under their container. */}
        {view === 'review' && entry && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              {history.length > 0 && (
                <ModalFooterButton variant="ghost" onClick={goBack}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Previous<Kbd>⌫</Kbd>
                </ModalFooterButton>
              )}
              <ModalFooterButton variant="ghost" onClick={() => setView('setup')}>Setup…<Kbd>S</Kbd></ModalFooterButton>
            </div>
            <div className="flex items-center gap-2">
              <ModalFooterButton variant="ghost" onClick={() => decideCurrent(OPTIONS[entry.status].keep.decision)}>
                {OPTIONS[entry.status].keep.label}<Kbd>←</Kbd>
              </ModalFooterButton>
              <ModalFooterButton
                variant={entry.status === 'removed' ? 'danger-solid' : 'hero'}
                onClick={() => decideCurrent(OPTIONS[entry.status].accept.decision)}
              >
                {OPTIONS[entry.status].accept.label}<Kbd>→</Kbd>
              </ModalFooterButton>
            </div>
          </div>
        )}
        {view === 'confirm' && (
          <div className="flex items-center justify-start gap-2 pt-1">
            <ModalFooterButton variant="ghost" onClick={() => setView('setup')}>Setup…</ModalFooterButton>
            <List className="w-3.5 h-3.5 text-zinc-600" />
            <span className="text-[10px] text-zinc-500">Only changed scenes are listed. Uncheck a field to keep your value.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
