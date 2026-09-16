import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, ExternalLink, FileText, Ruler, Scissors, Search, Sparkles, Upload } from 'lucide-react';
import { useProject } from '../store';
import { ScriptSceneText } from './script/ScriptSceneScript';
import { EighthsRuler } from './script/EighthsRuler';
import ScriptTagMenu, { type ScriptTagMenuState } from './script/ScriptTagMenu';
import SidebarNav, { type SidebarNavRow } from './SidebarNav';
import Button from './Button';
import { FloatingTooltip } from './FloatingTooltip';
import { useDialog } from './Dialog';
import { normalizeSceneNumber, formatSceneHeading } from '../lib/script';
import { mergeSceneWithNext } from '../lib/scriptSceneOps';
import { annotationColor } from '../lib/scriptAnnotations';
import {
  commitTag,
  suggestionRanges,
  annotationElementName,
  annotationCategoryLabel,
  type ScriptTagTarget,
} from '../lib/scriptTagging';
import { usePersistState } from '../lib/persist';
import { TEST_IDS } from '../lib/testIds';
import type { ScriptAnnotation, ScriptScene } from '../types';

/** The taggable block element enclosing a selection endpoint. */
function closestScriptBlock(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  return (el?.closest('[data-script-block]') as HTMLElement | null) ?? null;
}

/** The plain body text of a block, skipping the inline scene-number label (it
 *  renders inside the heading block but isn't body). */
function blockTextOf(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n.parentElement?.closest('[data-scene-number-label]')) continue;
    text += n.textContent || '';
  }
  return text;
}

/** Character offset of `(node, offset)` within `root`, skipping the inline
 *  scene-number label (it renders inside the heading block but isn't body). */
function offsetWithinBlock(root: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n.parentElement?.closest('[data-scene-number-label]')) continue;
    if (n === node) return total + offset;
    total += (n.textContent || '').length;
  }
  return total;
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
 * Tagging (roadmap 136): select text → a kit `ContextMenu` of every element
 * category; the highlight BECOMES the element. Committed tags are solid and
 * category-coloured; the Suggestions toggle shows ephemeral derived spans
 * (cast cues / known element names) and imported recognised tags as dotted.
 */
export function ScriptView({ headerTarget, onOpenSheet, onOpenSchedule, onUpdateScript, onCutScene }: {
  headerTarget?: HTMLElement | null;
  onOpenSheet?: (rowIndex: number) => void;
  onOpenSchedule?: (sceneId: string) => void;
  onUpdateScript?: () => void;
  onCutScene?: (sceneId: string) => void;
}) {
  const { state, dispatch, readOnly } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const doc = project.scriptDocument;
  const projectScenes = project.scenes;
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
  const [showSuggestions, setShowSuggestions] = usePersistState('lemon_schedule_script_suggestions', true);
  const [contentHeight, setContentHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sidebarPref, setSidebarPref] = usePersistState('lemon_schedule_script_sidebar', { width: 320 });

  const [tagMenu, setTagMenu] = useState<ScriptTagMenuState | null>(null);
  const [hovered, setHovered] = useState<{ annotation: ScriptAnnotation; x: number; y: number } | null>(null);
  /** The native selection range to keep highlighted while the menu is open. */
  const selectionRangeRef = useRef<Range | null>(null);

  // A text selection opens the category menu. Deferred so the browser has
  // committed the selection before we read it.
  const handleSelectionEnd = useCallback(() => {
    window.setTimeout(() => {
      if (readOnly) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        selectionRangeRef.current = null;
        // Never clobber a menu opened by a click on a tag (its click fires
        // after this mouseup).
        setTagMenu(prev => (prev && prev.source === 'annotation' ? prev : null));
        return;
      }
      const range = sel.getRangeAt(0);
      const startBlock = closestScriptBlock(range.startContainer);
      const endBlock = closestScriptBlock(range.endContainer);
      if (!startBlock || startBlock !== endBlock) return;
      const sceneId = startBlock.getAttribute('data-script-scene') || '';
      const blockIndex = Number(startBlock.getAttribute('data-script-block'));
      if (!sceneId || Number.isNaN(blockIndex)) return;
      const body = blockTextOf(startBlock);
      let start = offsetWithinBlock(startBlock, range.startContainer, range.startOffset);
      let end = offsetWithinBlock(startBlock, range.endContainer, range.endOffset);
      while (start < end && /\s/.test(body[start])) start++;
      while (end > start && /\s/.test(body[end - 1])) end--;
      if (end <= start) return;
      const text = body.slice(start, end);
      const existing = (project.scriptAnnotations || []).find(
        a => a.sceneId === sceneId && a.blockIndex === blockIndex && a.start === start && a.end === end,
      );
      selectionRangeRef.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      setTagMenu({ x: rect.left, y: rect.bottom, target: { sceneId, blockIndex, start, end, text }, existing, source: 'selection' });
    }, 0);
  }, [readOnly, project.scriptAnnotations]);

  // Keep the native selection highlighted while the selection menu is open:
  // Radix focuses its menu content on open, which clears the browser selection.
  // Re-apply the saved range after the menu mounts (and once more after the
  // focus handling settles), then drop it when the menu closes.
  useEffect(() => {
    if (!tagMenu) {
      window.getSelection()?.removeAllRanges();
      return;
    }
    if (tagMenu.source !== 'selection') return;
    const restore = () => {
      const range = selectionRangeRef.current;
      if (!range) return;
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    };
    restore();
    const raf = requestAnimationFrame(restore);
    const settle = window.setTimeout(restore, 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [tagMenu]);

  const openAnnotation = useCallback((annotation: ScriptAnnotation, event?: React.MouseEvent) => {
    if (readOnly) return;
    setHovered(null);
    selectionRangeRef.current = null;
    const existing = (project.scriptAnnotations || []).find(a => a.id === annotation.id);
    setTagMenu({
      x: event?.clientX ?? 0,
      y: event?.clientY ?? 0,
      target: { sceneId: annotation.sceneId, blockIndex: annotation.blockIndex, start: annotation.start, end: annotation.end, text: annotation.text },
      existing,
      source: 'annotation',
    });
  }, [readOnly, project.scriptAnnotations]);

  const handleAnnotationHover = useCallback((annotation: ScriptAnnotation | null, event?: React.MouseEvent) => {
    if (!annotation) { setHovered(null); return; }
    setHovered({ annotation, x: event?.clientX ?? 0, y: event?.clientY ?? 0 });
  }, []);

  const commitCategory = useCallback((category: string) => {
    if (!tagMenu || readOnly) return;
    const { target, existing } = tagMenu;
    commitTag(dispatch, project, target as ScriptTagTarget, category, existing);
    setTagMenu(null);
  }, [tagMenu, readOnly, dispatch, project]);

  const removeTag = useCallback(() => {
    if (!tagMenu) return;
    if (tagMenu.existing && !readOnly) dispatch({ type: 'REMOVE_SCRIPT_ANNOTATION', payload: tagMenu.existing.id });
    setTagMenu(null);
  }, [tagMenu, readOnly, dispatch]);

  const mergeNext = useCallback((sceneId: string) => {
    void dialog.confirm({
      title: 'Merge with next scene?',
      message: 'The next scene’s script joins this one and that scene is removed (to Trash, restorable). One undo step.',
      danger: true,
    }).then(ok => { if (ok) mergeSceneWithNext(dispatch, project, sceneId); });
  }, [dialog, dispatch, project]);

  // Script scene number → the live Scene it belongs to (for sets / navigation).
  const sceneByIdentity = useMemo(() => {
    const map = new Map<string, { id: string; index: number }>();
    projectScenes.forEach((s, index) => map.set(normalizeSceneNumber(s.sceneNumber), { id: s.id, index }));
    return map;
  }, [projectScenes]);

  // Ephemeral, toggle-gated derived suggestions (never persisted).
  const suggestions = useMemo(() => {
    if (!showSuggestions || !doc) return [];
    const out: ScriptAnnotation[] = [];
    for (const s of doc.scenes) {
      const live = sceneByIdentity.get(normalizeSceneNumber(s.sceneNumber));
      if (!live) continue;
      out.push(...suggestionRanges(project, projectScenes[live.index]));
    }
    return out;
  }, [showSuggestions, doc, sceneByIdentity, project, projectScenes]);

  // Committed (solid) + non-committed (dotted) spans, gated by the toggle.
  const visibleAnnotations = useMemo(() => {
    const stored = project.scriptAnnotations || [];
    const committed = stored.filter(a => !a.recognized);
    const nonCommitted = showSuggestions ? stored.filter(a => a.recognized && !a.id.startsWith('suggest:')) : [];
    const derived = showSuggestions ? suggestions : [];
    return [...committed, ...nonCommitted, ...derived];
  }, [project.scriptAnnotations, showSuggestions, suggestions]);

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
    setHovered(null);
    setTagMenu(prev => (prev?.source === 'selection' ? null : prev));
    if (activeRaf.current == null) {
      activeRaf.current = requestAnimationFrame(() => { activeRaf.current = null; updateActive(); });
    }
    if (saveTimer.current != null) return;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      const el = scrollRef.current;
      if (el) { try { localStorage.setItem(SCROLL_KEY, String(el.scrollTop)); } catch { /* ignore */ } }
    }, 150);
  }, [updateActive]);

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

  const hoverBadge = hovered && (() => {
    const a = hovered.annotation;
    const name = annotationElementName(project, a);
    const diverged = name.trim().toUpperCase() !== a.text.trim().toUpperCase();
    return (
      <div data-testid={TEST_IDS.scriptTagBadge} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/95 px-2.5 py-1.5 text-[11px] text-zinc-200 shadow-2xl backdrop-blur-md">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: annotationColor(a.category) }} />
        <span className="font-semibold">{annotationCategoryLabel(project, a.category)}</span>
        <span className="text-zinc-500">·</span>
        <span>{name}</span>
        {diverged && <span className="text-zinc-400">script: “{a.text}”</span>}
      </div>
    );
  })();

  const header = headerTarget ? createPortal(
    <>
      {doc && doc.scenes.length > 0 && (
        <span className="hidden min-w-0 items-center gap-1.5 md:flex" title={scriptLabel}>
          <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <span className="max-w-[20rem] truncate text-[11px] font-semibold text-zinc-600">{scriptLabel}</span>
        </span>
      )}
      {onUpdateScript && (
        <Button variant="subtle" type="button" onClick={onUpdateScript} title="Upload a revised screenplay and review the changes">
          <Upload className="w-3.5 h-3.5" /> Update script
        </Button>
      )}
      {doc && doc.scenes.length > 0 && (
        <>
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
          <Button
            variant="subtle"
            type="button"
            active={showSuggestions}
            aria-pressed={showSuggestions}
            onClick={() => setShowSuggestions(v => !v)}
            title={showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
          >
            <Sparkles className="w-3.5 h-3.5" /> Suggestions
          </Button>
          <button
            type="button"
            onClick={() => setShowEighths(v => !v)}
            aria-pressed={showEighths}
            title={showEighths ? 'Hide eighths ruler' : 'Show eighths ruler'}
            className={`p-1.5 rounded-md transition-colors ${showEighths ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'}`}
          >
            <Ruler className="h-4 w-4" />
          </button>
        </>
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
      <div ref={scrollRef} onScroll={handleScroll} onMouseUp={handleSelectionEnd} onKeyUp={handleSelectionEnd} className="flex-1 overflow-auto">
          <div className="mx-auto flex w-fit items-start px-6 py-6">
          <div ref={pageRef} className="w-[8.5in] max-w-full border border-zinc-200 bg-white px-14 py-12 shadow-sm select-text">
            {doc.titlePage?.title && (
              <div className="mb-12 text-center font-mono uppercase tracking-widest text-zinc-900">
                <div className="text-lg font-bold">{doc.titlePage.title}</div>
              </div>
            )}
            {doc.scenes.map((scene, i) => {
              const match = sceneByIdentity.get(normalizeSceneNumber(scene.sceneNumber));
              const nextDoc = doc.scenes[i + 1];
              const base = scene.sceneNumber.replace(/[A-Z]+$/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const isFragment = !!nextDoc
                && new RegExp(`^${base}[A-Z]$`, 'i').test(nextDoc.sceneNumber)
                && !!sceneByIdentity.get(normalizeSceneNumber(nextDoc.sceneNumber));
              return (
                <section
                  key={`${scene.sceneNumber}-${i}`}
                  ref={el => { if (el) sectionRefs.current.set(i, el); else sectionRefs.current.delete(i); }}
                  data-testid={TEST_IDS.scriptScene}
                  data-scene-number={scene.sceneNumber}
                  id={`script-scene-${i}`}
                  className="group relative scroll-mt-4 pb-6"
                >
                  {match && (onOpenSchedule || onOpenSheet || onCutScene || isFragment) && (
                    <div className="hover-reveal absolute right-0 top-3 z-10 flex items-center gap-1 rounded bg-white/90">
                      {onCutScene && (
                        <Button variant="subtle" type="button" onClick={() => onCutScene(match.id)} title="Cut this scene…">
                          <Scissors className="w-3.5 h-3.5" /> Cut
                        </Button>
                      )}
                      {isFragment && (
                        <Button variant="subtle" type="button" onClick={() => mergeNext(match.id)} title="Merge the next scene into this one">
                          Merge
                        </Button>
                      )}
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
                    annotations={visibleAnnotations}
                    sceneId={match?.id}
                    onAnnotationClick={openAnnotation}
                    onAnnotationHover={handleAnnotationHover}
                  />
                </section>
              );
            })}
          </div>
          {showEighths && <EighthsRuler contentHeight={contentHeight} lineHeight={READ_LINE_HEIGHT} />}
        </div>
      </div>
      <ScriptTagMenu
        menu={tagMenu}
        project={project}
        onCommit={commitCategory}
        onRemove={removeTag}
        onClose={() => setTagMenu(null)}
      />
      <FloatingTooltip open={!!hovered && !tagMenu} anchor={hovered ? { x: hovered.x, y: hovered.y } : null}>
        {hoverBadge}
      </FloatingTooltip>
    </div>
  );
}
