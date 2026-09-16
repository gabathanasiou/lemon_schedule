import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronUp, ExternalLink, FileText, MoreHorizontal, Ruler, Scissors, Search, SlidersHorizontal, Sparkles, Tag as TagIcon, Upload, X } from 'lucide-react';
import { useProject } from '../store';
import { ScriptSceneText } from './script/ScriptSceneScript';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { EighthsRuler } from './script/EighthsRuler';
import { ScriptTagOverlay, useScriptTagging } from './script/ScriptTagging';
import SidebarNav, { type SidebarNavRow } from './SidebarNav';
import Button from './Button';
import { normalizeSceneNumber, formatSceneHeading } from '../lib/script';
import { cutSceneAt, mergeSceneWithNext } from '../lib/scriptSceneOps';
import { IS_COARSE } from '../lib/device';
import { usePersistState } from '../lib/persist';
import { TEST_IDS } from '../lib/testIds';
import type { ScriptScene } from '../types';

/** A razor-cut junction between two split scenes — hover reveals Merge. */
function CutHandle({ label, onMerge, disabled }: { label: string; onMerge: () => void; disabled?: boolean }) {
  return (
    <div data-testid={TEST_IDS.scriptCutHandle} className="group relative z-10 -my-1 flex h-7 items-center justify-center">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-zinc-300" />
      <Button
        variant="subtle"
        type="button"
        disabled={disabled}
        onClick={() => onMerge()}
        title={`Merge ${label} back together (one undo step)`}
        className="hover-reveal relative bg-white shadow-sm"
      >
        <Scissors className="w-3.5 h-3.5 rotate-90" /> Merge
      </Button>
    </div>
  );
}

const READ_FONT_CLASS = 'text-[15px] leading-[1.7]';
/** Must match READ_FONT_CLASS (15px × 1.7) — drives the eighths ruler scale. */
const READ_LINE_HEIGHT = 15 * 1.7;
const SCROLL_KEY = 'lemon_schedule_script_scroll';

const headingText = (scene: ScriptScene) => scene.blocks.find(b => b[0] === 'heading')?.[1] || '';

/** Best-effort INT/EXT from a retained scene heading. */
function intExtFromHeading(scene: ScriptScene): string {
  const m = headingText(scene).match(/^\s*(INT\.?\/EXT|INT\.?|EXT\.?|I\/E)/i);
  return m ? m[1].replace(/\./g, '').toUpperCase() : '';
}

/** Short snippet of the paragraph a razor break sits after (touch bar label). */
function cutSnippet(scene: ScriptScene | undefined, blockIndex: number): string {
  const text = (scene?.blocks[blockIndex - 1]?.[1] || '').trim();
  return text.length > 28 ? `${text.slice(0, 28)}…` : (text || '—');
}

/** Best-effort set name from a retained scene heading ("INT. KITCHEN - DAY"). */
function setFromHeading(scene: ScriptScene): string {
  const heading = headingText(scene);
  const m = heading.match(/^(?:INT|EXT|INT\.?\/EXT|I\/E)[.\s]+(.*?)(?:\s+-\s+(?:DAY|NIGHT|MORNING|EVENING|CONTINUOUS|LATER|DUSK|DAWN|MOMENTS).*)?$/i);
  return (m?.[1] || heading).trim();
}

/**
 * Script sub-tab (roadmap 123 Phase 1) — reads the retained screenplay body in
 * Breakdown. Read-only: a left scene sidebar (number · INT/EXT · set, grouped by
 * set, jumps to the scene), Final-Draft-style scene numbers, full-text search
 * with inline highlights, an eighths ruler, scroll memory and scene-linked jumps
 * into Sheet / Schedule. Rendering is the shared `ScriptSceneText` (light theme)
 * — never a second screenplay renderer.
 *
 * Tagging (roadmap 136): select text → a category menu; the highlight BECOMES
 * the element. Committed tags are solid; the Suggestions toggle shows ephemeral
 * derived spans (cast cues / known element names) as lighter highlights.
 */
export function ScriptView({ headerTarget, onOpenSheet, onOpenSchedule, onUpdateScript, onCutScene, cutMode, onCutModeChange }: {
  headerTarget?: HTMLElement | null;
  onOpenSheet?: (rowIndex: number) => void;
  onOpenSchedule?: (sceneId: string) => void;
  onUpdateScript?: () => void;
  onCutScene?: (sceneId: string, splitIndex?: number) => void;
  /** Razor tool active (toolbar toggle in BreakdownTab). */
  cutMode?: boolean;
  onCutModeChange?: (v: boolean) => void;
}) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const doc = project.scriptDocument;
  const projectScenes = project.scenes;
  const tagging = useScriptTagging();
  // One label: the imported script file (its "version"), falling back to the
  // screenplay title / project name. Refreshes on every import/update.
  const scriptLabel = doc?.name?.trim() || doc?.titlePage?.title?.trim() || project.title || 'Untitled script';

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  /** Section elements by index — popout-safe (no global getElementById). */
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map());

  const [query, setQuery] = useState('');
  const [matchPos, setMatchPos] = useState(0);
  const [showEighths, setShowEighths] = useState(true);
  const [showTags, setShowTags] = usePersistState('lemon_schedule_script_show_tags', true);
  const [scriptMenuOpen, setScriptMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sidebarPref, setSidebarPref] = usePersistState('lemon_schedule_script_sidebar', { width: 320 });

  const [razor, setRazor] = useState<{ sceneIndex: number; blockIndex: number; top: number } | null>(null);
  const [touchBar, setTouchBar] = useState<{ sceneIndex: number; blockIndex: number; top: number } | null>(null);
  const draggingRef = useRef(false);

  const cutActive = !!cutMode;

  /** Merge a cut back (the junction handle). Instant + undoable, fragment → Trash. */
  const mergeCut = useCallback((sceneId: string) => {
    if (readOnly) return;
    mergeSceneWithNext(dispatch, project, sceneId);
  }, [readOnly, dispatch, project]);

  // Script scene number → the live Scene it belongs to (for sets / navigation).
  const sceneByIdentity = useMemo(() => {
    const map = new Map<string, { id: string; index: number }>();
    projectScenes.forEach((s, index) => map.set(normalizeSceneNumber(s.sceneNumber), { id: s.id, index }));
    return map;
  }, [projectScenes]);

  // ---- Razor cut tool (Premiere-style) ----
  /** Paragraph-gap boundaries for a scene section. `y` is the MIDPOINT of the
   *  gap between the two paragraphs (viewport coords), so the razor sits
   *  centered in the whitespace rather than on a block edge. */
  const sectionBoundaries = useCallback((sceneIndex: number): { k: number; y: number }[] => {
    const el = sectionRefs.current.get(sceneIndex);
    if (!el) return [];
    const blocks = Array.from(el.querySelectorAll<HTMLElement>('[data-script-block]'));
    const out: { k: number; y: number }[] = [];
    for (let k = 1; k < blocks.length; k++) {
      const curr = blocks[k].getBoundingClientRect();
      const prev = blocks[k - 1].getBoundingClientRect();
      out.push({ k, y: curr.top >= prev.bottom ? (prev.bottom + curr.top) / 2 : curr.top });
    }
    return out;
  }, []);

  const nearestBoundary = useCallback((sceneIndex: number, clientY: number): { k: number; y: number } | null => {
    const bs = sectionBoundaries(sceneIndex);
    if (bs.length === 0) return null;
    let best = bs[0];
    for (const b of bs) if (Math.abs(b.y - clientY) < Math.abs(best.y - clientY)) best = b;
    return best;
  }, [sectionBoundaries]);

  const sectionIndexAt = useCallback((clientY: number): number | null => {
    for (const [i, el] of sectionRefs.current) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) return i;
    }
    return null;
  }, []);

  const liveSceneForDocIndex = useCallback((sceneIndex: number) => {
    const scene = doc?.scenes[sceneIndex];
    if (!scene) return undefined;
    const live = sceneByIdentity.get(normalizeSceneNumber(scene.sceneNumber));
    return live ? projectScenes[live.index] : undefined;
  }, [doc, sceneByIdentity, projectScenes]);

  const performCut = useCallback((sceneIndex: number, blockIndex: number, options?: boolean) => {
    const live = liveSceneForDocIndex(sceneIndex);
    if (!live || readOnly) return;
    if (options) { onCutScene?.(live.id, blockIndex); return; }
    if (cutSceneAt(dispatch, project, live.id, blockIndex)) onCutModeChange?.(false);
  }, [liveSceneForDocIndex, readOnly, onCutScene, dispatch, project, onCutModeChange]);

  /** Top of the page's padding box in viewport coords (absolute-position origin). */
  const pageOriginTop = useCallback(() => {
    const el = pageRef.current;
    return el ? el.getBoundingClientRect().top + el.clientTop : 0;
  }, []);

  const handleRazorMove = useCallback((e: React.MouseEvent) => {
    const section = (e.target as HTMLElement).closest('[data-scene-index]') as HTMLElement | null;
    const sceneIndex = section ? Number(section.getAttribute('data-scene-index')) : NaN;
    if (Number.isNaN(sceneIndex)) { setRazor(null); return; }
    const b = nearestBoundary(sceneIndex, e.clientY);
    if (!b) { setRazor(null); return; }
    setRazor({ sceneIndex, blockIndex: b.k, top: b.y - pageOriginTop() });
  }, [nearestBoundary]);

  const handleRazorClick = useCallback((e: React.MouseEvent) => {
    if (!razor) return;
    e.preventDefault();
    performCut(razor.sceneIndex, razor.blockIndex, e.altKey);
    if (e.altKey) onCutModeChange?.(false);
  }, [razor, performCut, onCutModeChange]);

  // Touch: a persistent draggable razor bar (no hover/cursor on iPad).
  const initTouchBar = useCallback(() => {
    const el = scrollRef.current;
    const center = el ? el.getBoundingClientRect().top + el.clientHeight / 2 : window.innerHeight / 2;
    let idx = sectionIndexAt(center);
    if (idx == null) {
      let best: number | null = null;
      let bestD = Infinity;
      for (const [i, node] of sectionRefs.current) {
        const r = node.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - center);
        if (d < bestD) { bestD = d; best = i; }
      }
      idx = best;
    }
    if (idx == null) return;
    const b = nearestBoundary(idx, center);
    if (!b) return;
    setTouchBar({ sceneIndex: idx, blockIndex: b.k, top: b.y - pageOriginTop() });
  }, [sectionIndexAt, nearestBoundary]);

  const updateTouchFromPointer = useCallback((clientY: number) => {
    const idx = sectionIndexAt(clientY);
    if (idx == null) return;
    const b = nearestBoundary(idx, clientY);
    if (b) setTouchBar({ sceneIndex: idx, blockIndex: b.k, top: b.y - pageOriginTop() });
  }, [sectionIndexAt, nearestBoundary]);

  useEffect(() => {
    if (cutMode && IS_COARSE) initTouchBar();
    if (!cutMode) { setRazor(null); setTouchBar(null); }
  }, [cutMode, initTouchBar]);

  useEffect(() => {
    if (!cutMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCutModeChange?.(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cutMode, onCutModeChange]);

  // Sidebar rows: every scene in order — number · INT/EXT · set (flat list).
  const navRows: SidebarNavRow[] = useMemo(() => {
    if (!doc) return [];
    return doc.scenes.map((scene, i) => {
      const live = sceneByIdentity.get(normalizeSceneNumber(scene.sceneNumber));
      const liveScene = live ? projectScenes[live.index] : undefined;
      const heading = liveScene && (liveScene.intExt || liveScene.set)
        ? formatSceneHeading(liveScene.intExt, liveScene.set, liveScene.dayNight)
        : (headingText(scene) || formatSceneHeading(intExtFromHeading(scene), setFromHeading(scene), ''));
      return {
        key: String(i),
        label: [scene.sceneNumber, heading].filter(Boolean).join('  '),
      };
    });
  }, [doc, sceneByIdentity, projectScenes]);

  const q = query.trim();
  const matches = useMemo(() => {
    if (!q || !doc) return [];
    const lq = q.toLowerCase();
    return doc.scenes
      .map((scene, i) => ({ i, count: scene.blocks.filter(([t, text]) => t !== 'page_break' && text.toLowerCase().includes(lq)).length }))
      .filter(m => m.count > 0);
  }, [q, doc]);

  // A programmatic jump must not be re-detected as the neighbor above it while
  // the scroll settles; suppress the detector briefly.
  const suppressActiveUntil = useRef(0);
  const jumpTo = useCallback((index: number) => {
    setActiveIndex(index);
    suppressActiveUntil.current = Date.now() + 500;
    sectionRefs.current.get(index)?.scrollIntoView({ block: 'start' });
  }, []);

  // Jump to the first match whenever the query changes.
  useEffect(() => {
    setMatchPos(0);
    if (matches.length > 0) jumpTo(matches[0].i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const stepMatch = useCallback((delta: number) => {
    if (matches.length === 0) return;
    const p = (matchPos + delta + matches.length) % matches.length;
    setMatchPos(p);
    jumpTo(matches[p].i);
  }, [matchPos, matches, jumpTo]);

  // Remember + restore the scroll position across sub-tab switches.
  const saveTimer = useRef<number | null>(null);
  const activeRaf = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = Number(localStorage.getItem(SCROLL_KEY) || '0');
    if (saved > 0) requestAnimationFrame(() => { el.scrollTop = saved; });
  }, []);

  const updateActive = useCallback(() => {
    if (Date.now() < suppressActiveUntil.current) return;
    const el = scrollRef.current;
    if (!el || !doc) return;
    // Tolerance must exceed the section's scroll-mt (16px) so a section that
    // just scrolled to the top still counts as active (otherwise the neighbor
    // above wins).
    const top = el.getBoundingClientRect().top + 24;
    let idx = 0;
    for (let i = 0; i < doc.scenes.length; i++) {
      const node = sectionRefs.current.get(i);
      if (!node) continue;
      if (node.getBoundingClientRect().top <= top) idx = i; else break;
    }
    setActiveIndex(idx);
  }, [doc]);

  // Keep the active scene visible in the sidebar as its own list scrolls.
  useEffect(() => {
    const anchor = sectionRefs.current.get(activeIndex) || sectionRefs.current.get(0);
    const rowDoc = anchor?.ownerDocument || document;
    const row = rowDoc.querySelector<HTMLElement>(`[data-sidebar-row="${activeIndex}"]`);
    const aside = row?.closest('aside');
    if (!row || !aside) return;
    const header = aside.querySelector<HTMLElement>('.sticky');
    const topInset = (header?.getBoundingClientRect().height ?? 0) + 12;
    // Leave breathing room below the active row instead of pinning it to the
    // very bottom edge of the sidebar.
    const bottomInset = 64;
    const r = row.getBoundingClientRect();
    const a = aside.getBoundingClientRect();
    if (r.top < a.top + topInset) aside.scrollTop -= (a.top + topInset - r.top);
    else if (r.bottom > a.bottom - bottomInset) aside.scrollTop += (r.bottom - (a.bottom - bottomInset));
  }, [activeIndex]);

  const handleScroll = useCallback(() => {
    tagging.handleAnnotationHover(null);
    tagging.closeMenu();
    if (activeRaf.current == null) {
      activeRaf.current = requestAnimationFrame(() => { activeRaf.current = null; updateActive(); });
    }
    if (saveTimer.current != null) return;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      const el = scrollRef.current;
      if (el) { try { localStorage.setItem(SCROLL_KEY, String(el.scrollTop)); } catch { /* ignore */ } }
    }, 150);
  }, [updateActive, tagging]);

  // Measure the page so the eighths ruler scales to the real content.
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, showEighths]);

  const header = headerTarget ? createPortal(
    <>
      {doc && doc.scenes.length > 0 && (
        <DropdownMenu
          open={scriptMenuOpen}
          onOpenChange={setScriptMenuOpen}
          theme="light"
          width="w-64"
          trigger={
            <Button variant="subtle" type="button" title={scriptLabel}>
              <FileText className="w-3.5 h-3.5" />
              <span className="max-w-[16rem] truncate">{scriptLabel}</span>
              <ChevronDown className="w-3 h-3.5 text-zinc-400" />
            </Button>
          }
        >
          {onUpdateScript && (
            <DropdownItem icon={<Upload className="w-3.5 h-3.5" />} onClick={() => { setScriptMenuOpen(false); onUpdateScript(); }}>
              Update script…
            </DropdownItem>
          )}
          <DropdownDivider />
          <DropdownItem disabled onClick={() => {}} trailing={<span className="text-[10px] text-zinc-400">{(doc.format || '').toUpperCase()} · {doc.scenes.length} scenes</span>}>
            Script
          </DropdownItem>
        </DropdownMenu>
      )}
      {doc && doc.scenes.length > 0 && (
        <div className="relative flex items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            aria-label="Search script"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search script"
            className="w-40 rounded border border-zinc-200 bg-white py-1 pl-7 pr-2 text-[11px] text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
          {q && (
            <span className="ml-1.5 min-w-[3.5rem] text-[10px] tabular-nums text-zinc-500">
              {matches.length === 0 ? 'No matches' : `${matchPos + 1}/${matches.length}`}
            </span>
          )}
          <button type="button" title="Previous match" onClick={() => stepMatch(-1)} disabled={matches.length === 0}
            className="ml-0.5 rounded p-0.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Next match" onClick={() => stepMatch(1)} disabled={matches.length === 0}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {doc && doc.scenes.length > 0 && (
        <DropdownMenu
          open={viewMenuOpen}
          onOpenChange={setViewMenuOpen}
          theme="light"
          width="w-52"
          trigger={
            <Button variant="subtle" type="button">
              <SlidersHorizontal className="w-3.5 h-3.5" /> View <ChevronDown className="w-3 h-3.5 text-zinc-400" />
            </Button>
          }
        >
          <DropdownItem
            keepOpen
            icon={<Sparkles className="w-3.5 h-3.5" />}
            trailing={tagging.showSuggestions ? <Check className="w-3 h-3" /> : undefined}
            onClick={() => tagging.setShowSuggestions(v => !v)}
          >
            Suggestions
          </DropdownItem>
          <DropdownItem
            keepOpen
            icon={<Ruler className="w-3.5 h-3.5" />}
            trailing={showEighths ? <Check className="w-3 h-3" /> : undefined}
            onClick={() => setShowEighths(v => !v)}
          >
            Eighths ruler
          </DropdownItem>
          <DropdownItem
            keepOpen
            icon={<TagIcon className="w-3.5 h-3.5" />}
            trailing={showTags ? <Check className="w-3 h-3" /> : undefined}
            onClick={() => setShowTags(v => !v)}
          >
            Tags
          </DropdownItem>
        </DropdownMenu>
      )}
    </>,
    headerTarget,
  ) : null;

  if (!doc || doc.scenes.length === 0) {
    return (
      <div data-testid={TEST_IDS.scriptView} className="flex-1 flex flex-col items-center justify-center gap-2 bg-white text-zinc-400">
        {header}
        <FileText className="w-8 h-8" />
        <p className="text-sm text-zinc-500">No script retained for this project.</p>
        <p className="text-xs text-zinc-400">Import a screenplay (.fdx or .fountain) to read it here.</p>
      </div>
    );
  }

  return (
    <div data-testid={TEST_IDS.scriptView} className="flex-1 flex min-h-0 bg-zinc-100">
      {header}
      <SidebarNav
        title="Scenes"
        rows={navRows}
        activeKey={String(activeIndex)}
        onSelect={key => jumpTo(Number(key))}
        resizable
        wrapRows
        width={sidebarPref.width}
        onWidthChange={w => setSidebarPref({ width: w })}
      />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseUp={cutActive ? undefined : tagging.handleSelectionEnd}
        onKeyUp={cutActive ? undefined : tagging.handleSelectionEnd}
        className="flex-1 overflow-auto"
      >
          <div className="mx-auto flex w-fit items-start px-6 py-6">
          <div
            ref={pageRef}
            onMouseMove={cutActive && !IS_COARSE ? handleRazorMove : undefined}
            onMouseLeave={cutActive && !IS_COARSE ? () => setRazor(null) : undefined}
            onClick={cutActive && !IS_COARSE ? handleRazorClick : undefined}
            className={`relative w-[8.5in] max-w-full border border-zinc-200 bg-white px-14 py-12 shadow-sm ${cutActive ? 'script-razor select-none' : 'select-text'}`}
          >
            {doc.titlePage?.title && (
              <div className="mb-12 text-center font-mono uppercase tracking-widest text-zinc-900">
                <div className="text-lg font-bold">{doc.titlePage.title}</div>
              </div>
            )}
            {doc.scenes.map((scene, i) => {
              const match = sceneByIdentity.get(normalizeSceneNumber(scene.sceneNumber));
              const currentLive = match ? projectScenes[match.index] : undefined;
              const prevDoc = doc.scenes[i - 1];
              const prevMatch = prevDoc ? sceneByIdentity.get(normalizeSceneNumber(prevDoc.sceneNumber)) : undefined;
              const prevLive = prevMatch ? projectScenes[prevMatch.index] : undefined;
              const isCutHere = !!currentLive && currentLive.duplicateKind === 'split'
                && !!prevLive && currentLive.duplicateOf === prevLive.id;
              return (
                <React.Fragment key={`${scene.sceneNumber}-${i}`}>
                  {isCutHere && prevLive && (
                    <CutHandle
                      label={`${prevLive.sceneNumber} / ${scene.sceneNumber}`}
                      onMerge={() => mergeCut(prevLive.id)}
                      disabled={readOnly}
                    />
                  )}
                  <section
                    ref={el => { if (el) sectionRefs.current.set(i, el); else sectionRefs.current.delete(i); }}
                    data-testid={TEST_IDS.scriptScene}
                    data-scene-number={scene.sceneNumber}
                    data-scene-index={i}
                    id={`script-scene-${i}`}
                    className="group relative scroll-mt-4 pb-6"
                  >
                    {!cutActive && match && (onOpenSchedule || onOpenSheet) && (
                      <div className="hover-reveal absolute right-0 top-3 z-10 flex items-center gap-1 rounded bg-white/90">
                        {onOpenSchedule && (
                          <Button variant="subtle" type="button" onClick={() => onOpenSchedule(match.id)} title="Open in Schedule">
                            <ExternalLink className="w-3.5 h-3.5" /> Schedule
                          </Button>
                        )}
                        {onOpenSheet && (
                          <Button variant="subtle" type="button" onClick={() => onOpenSheet(match.index)} title="Open in Sheet">
                            Sheet
                          </Button>
                        )}
                      </div>
                    )}
                    <ScriptSceneText
                      scene={scene}
                      theme="light"
                      fontClass={READ_FONT_CLASS}
                      highlight={q}
                      sceneNumber={scene.sceneNumber}
                      annotations={showTags ? tagging.annotations : []}
                      sceneId={match?.id}
                      onAnnotationClick={tagging.openAnnotation}
                      onAnnotationHover={tagging.handleAnnotationHover}
                    />
                  </section>
                </React.Fragment>
              );
            })}
            {cutActive && !IS_COARSE && razor && (
              <div
                data-testid={TEST_IDS.scriptCutLine}
                className="pointer-events-none absolute -left-3 -right-3 z-30 flex -translate-y-1/2 items-center"
                style={{ top: razor.top }}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-white shadow-md">
                  <Scissors className="w-3 h-3" />
                </span>
                <span className="h-0.5 flex-1 bg-blue-500" />
              </div>
            )}
            {cutActive && IS_COARSE && touchBar && (
              <div
                data-testid={TEST_IDS.scriptCutBar}
                className="absolute -left-3 -right-3 z-30 flex -translate-y-1/2 items-center"
                style={{ top: touchBar.top }}
              >
                <span className="h-0.5 flex-1 bg-blue-500" />
                <div
                  className="flex touch-none items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/95 px-1.5 py-1 shadow-2xl backdrop-blur-md"
                  onPointerDown={e => { draggingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
                  onPointerMove={e => { if (draggingRef.current) updateTouchFromPointer(e.clientY); }}
                  onPointerUp={() => { draggingRef.current = false; }}
                  onPointerCancel={() => { draggingRef.current = false; }}
                >
                  <Button variant="subtle" theme="dark" type="button" title="Cancel cut" onClick={() => onCutModeChange?.(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <span className="px-1 text-[11px] font-semibold text-zinc-300">
                    Break before “{cutSnippet(doc.scenes[touchBar.sceneIndex], touchBar.blockIndex)}”
                  </span>
                  <Button data-testid={TEST_IDS.scriptCutButton} variant="primary" theme="dark" type="button" onClick={() => performCut(touchBar.sceneIndex, touchBar.blockIndex)}>
                    Cut
                  </Button>
                  <Button
                    variant="subtle"
                    theme="dark"
                    type="button"
                    title="Cut with options…"
                    onClick={() => { performCut(touchBar.sceneIndex, touchBar.blockIndex, true); onCutModeChange?.(false); }}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <span className="h-0.5 flex-1 bg-blue-500" />
              </div>
            )}
          </div>
          {showEighths && <EighthsRuler contentHeight={contentHeight} lineHeight={READ_LINE_HEIGHT} />}
        </div>
      </div>
      <ScriptTagOverlay tagging={tagging} project={project} />
    </div>
  );
}
