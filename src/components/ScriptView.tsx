import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, ExternalLink, FileText, Ruler, Search, Upload } from 'lucide-react';
import { useProject } from '../store';
import { ScriptSceneText } from './script/ScriptSceneScript';
import { EighthsRuler } from './script/EighthsRuler';
import SidebarNav, { type SidebarNavRow } from './SidebarNav';
import { normalizeSceneNumber, formatSceneHeading } from '../lib/script';
import { usePersistState } from '../lib/persist';
import { TEST_IDS } from '../lib/testIds';
import type { ScriptScene } from '../types';

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
 */
export function ScriptView({ headerTarget, onOpenSheet, onOpenSchedule, onUpdateScript }: {
  headerTarget?: HTMLElement | null;
  onOpenSheet?: (rowIndex: number) => void;
  onOpenSchedule?: (sceneId: string) => void;
  onUpdateScript?: () => void;
}) {
  const { state } = useProject();
  const project = state.present;
  const doc = project.scriptDocument;
  const projectScenes = project.scenes;
  const scriptName = doc?.titlePage?.title?.trim() || project.title || 'Untitled script';
  const formatLabel = doc ? doc.format.toUpperCase() : '';

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  /** Section elements by index — popout-safe (no global getElementById). */
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map());

  const [query, setQuery] = useState('');
  const [matchPos, setMatchPos] = useState(0);
  const [showEighths, setShowEighths] = useState(true);
  const [contentHeight, setContentHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sidebarPref, setSidebarPref] = usePersistState('lemon_schedule_script_sidebar', { width: 320 });

  // Script scene number → the live Scene it belongs to (for sets / navigation).
  const sceneByIdentity = useMemo(() => {
    const map = new Map<string, { id: string; index: number }>();
    projectScenes.forEach((s, index) => map.set(normalizeSceneNumber(s.sceneNumber), { id: s.id, index }));
    return map;
  }, [projectScenes]);

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

  const header = headerTarget ? createPortal(
    <>
      {doc && doc.scenes.length > 0 && (
        <span className="hidden min-w-0 items-center gap-1.5 md:flex" title={scriptName}>
          <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <span className="max-w-[14rem] truncate text-[11px] font-semibold text-zinc-600">{scriptName}</span>
          {formatLabel && (
            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">{formatLabel}</span>
          )}
        </span>
      )}
      {onUpdateScript && (
        <button
          type="button"
          onClick={onUpdateScript}
          title="Upload a revised screenplay and review the changes"
          className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <Upload className="h-3 w-3" /> Update script
        </button>
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
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto">
          <div className="mx-auto flex w-fit items-start px-6 py-6">
          <div ref={pageRef} className="w-[8.5in] max-w-full border border-zinc-200 bg-white px-14 py-12 shadow-sm select-text">
            {doc.titlePage?.title && (
              <div className="mb-12 text-center font-mono uppercase tracking-widest text-zinc-900">
                <div className="text-lg font-bold">{doc.titlePage.title}</div>
              </div>
            )}
            {doc.scenes.map((scene, i) => {
              const match = sceneByIdentity.get(normalizeSceneNumber(scene.sceneNumber));
              return (
                <section
                  key={`${scene.sceneNumber}-${i}`}
                  ref={el => { if (el) sectionRefs.current.set(i, el); else sectionRefs.current.delete(i); }}
                  data-testid={TEST_IDS.scriptScene}
                  data-scene-number={scene.sceneNumber}
                  id={`script-scene-${i}`}
                  className="group relative scroll-mt-4 pb-6"
                >
                  {match && (onOpenSchedule || onOpenSheet) && (
                    <div className="hover-reveal absolute right-0 top-3 z-10 flex items-center gap-1 rounded bg-white/90">
                      {onOpenSchedule && (
                        <button type="button" onClick={() => onOpenSchedule(match.id)} title="Open in Schedule"
                          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                          <ExternalLink className="h-3 w-3" /> Schedule
                        </button>
                      )}
                      {onOpenSheet && (
                        <button type="button" onClick={() => onOpenSheet(match.index)} title="Open in Sheet"
                          className="rounded px-1 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                          Sheet
                        </button>
                      )}
                    </div>
                  )}
                  <ScriptSceneText scene={scene} theme="light" fontClass={READ_FONT_CLASS} highlight={q} sceneNumber={scene.sceneNumber} />
                </section>
              );
            })}
          </div>
          {showEighths && <EighthsRuler contentHeight={contentHeight} lineHeight={READ_LINE_HEIGHT} />}
        </div>
      </div>
    </div>
  );
}
