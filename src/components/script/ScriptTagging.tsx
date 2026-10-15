import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FloatingTooltip } from '../FloatingTooltip';
import ScriptTagMenu, { type ScriptTagMenuState } from './ScriptTagMenu';
import { useProject } from '../../store';
import { annotationColor } from '../../lib/scriptAnnotations';
import { annotationCategoryLabel, annotationElementName, sceneSpans, sceneSpansEqual, commitTag, detachTag, type SceneSpans, type TagExisting } from '../../lib/scriptTagging';
import { useQueueCastNaming } from '../../lib/newCastNaming';
import { CAT_ICONS, getCustomIcon } from '../../lib/categories';
import { usePersistState } from '../../lib/persist';
import { TEST_IDS } from '../../lib/testIds';
import type { Project, Scene, ScriptAnnotation } from '../../types';

/**
 * Script tagging interaction (roadmap 136), shared by the Script sub-tab and the
 * portable `SceneScriptPane` so both select → category menu / hover badge /
 * commit the same way — never a second copy. Rendering stays in
 * `ScriptSceneText`; this owns only the selection state and menu wiring.
 */

/** The taggable block element enclosing a selection endpoint. */
export function closestScriptBlock(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  return (el?.closest('[data-script-block]') as HTMLElement | null) ?? null;
}

/** The plain body text of a block, skipping the inline scene-number label. */
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

export interface ScriptTaggingApi {
  /** The spans for ONE live scene — committed (solid) → attached (solid) →
   *  recognized → suggestions (wavy), lazily derived + cached. */
  annotationsForScene: (sceneId: string | undefined) => ScriptAnnotation[];
  tagMenu: ScriptTagMenuState | null;
  hovered: { annotation: ScriptAnnotation; x: number; y: number } | null;
  showSuggestions: boolean;
  setShowSuggestions: (updater: (v: boolean) => boolean) => void;
  handleSelectionEnd: () => void;
  handleAnnotationHover: (annotation: ScriptAnnotation | null, event?: React.MouseEvent) => void;
  openAnnotation: (annotation: ScriptAnnotation, event?: React.MouseEvent) => void;
  onCommit: (category: string) => void;
  onRemove: () => void;
  closeMenu: () => void;
}

/** Stable empty result so memoized scenes don't re-render on identity churn. */
const NO_ANNOTATIONS: ScriptAnnotation[] = [];
const NO_STORED: ScriptAnnotation[] = [];

/** One lazily-derived scene's spans + the slice identities they were computed
 *  from. Entries live across renders, so a tag committed in ONE scene only
 *  invalidates that scene (the old global derivation rebuilt everything on
 *  every project change). */
interface SpansEntry {
  scene: Scene;
  stored: ScriptAnnotation[];
  doc: Project['scriptDocument'];
  showSuggestions: boolean;
  cast: Project['castMembers'];
  elements: Project['breakdownElements'];
  custom: Project['customCategories'];
  labels: Project['categoryLabels'];
  spans: SceneSpans;
}

export function useScriptTagging(): ScriptTaggingApi {
  const { state, dispatch, locked } = useProject();
  const project = state.present;
  const projectRef = useRef(project);
  projectRef.current = project;
  const { queue: queueCastNaming } = useQueueCastNaming();
  const [showSuggestions, setShowSuggestions] = usePersistState('lemon_schedule_script_suggestions', true);
  const showSuggestionsRef = useRef(showSuggestions);
  showSuggestionsRef.current = showSuggestions;
  const [tagMenu, setTagMenu] = useState<ScriptTagMenuState | null>(null);
  const [hovered, setHovered] = useState<{ annotation: ScriptAnnotation; x: number; y: number } | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);

  const projectScenes = project.scenes;
  const scenesById = useMemo(() => {
    const map = new Map<string, Scene>();
    for (const s of projectScenes) map.set(s.id, s);
    return map;
  }, [projectScenes]);
  const scenesByIdRef = useRef(scenesById);
  scenesByIdRef.current = scenesById;

  // This scene's stored annotations, with IDENTITY PRESERVED when the scene's
  // slice didn't change — a commit in scene A must leave scene B's array (and
  // therefore its cached spans and memoized render) untouched.
  const storedBySceneRef = useRef<Map<string, ScriptAnnotation[]> | null>(null);
  const storedByScene = useMemo(() => {
    const prev = storedBySceneRef.current;
    const map = new Map<string, ScriptAnnotation[]>();
    for (const a of project.scriptAnnotations || []) {
      const arr = map.get(a.sceneId);
      if (arr) arr.push(a); else map.set(a.sceneId, [a]);
    }
    if (prev) {
      for (const [id, arr] of map) {
        const old = prev.get(id);
        if (old && old.length === arr.length && old.every((x, i) => x === arr[i])) map.set(id, old);
      }
    }
    storedBySceneRef.current = map;
    return map;
  }, [project.scriptAnnotations]);

  const spansCacheRef = useRef(new Map<string, SpansEntry>());
  const cacheDocRef = useRef<Project['scriptDocument']>(undefined);

  const spansFor = useCallback((sceneId: string): SceneSpans | null => {
    const p = projectRef.current;
    const scene = scenesByIdRef.current.get(sceneId);
    if (!scene) return null;
    const cache = spansCacheRef.current;
    if (cacheDocRef.current !== p.scriptDocument) {
      cache.clear();
      cacheDocRef.current = p.scriptDocument;
    }
    const stored = storedBySceneRef.current?.get(sceneId) ?? NO_STORED;
    const show = showSuggestionsRef.current;
    const hit = cache.get(sceneId);
    if (hit
      && hit.scene === scene
      && hit.stored === stored
      && hit.doc === p.scriptDocument
      && hit.showSuggestions === show
      && hit.cast === p.castMembers
      && hit.elements === p.breakdownElements
      && hit.custom === p.customCategories
      && hit.labels === p.categoryLabels) {
      return hit.spans;
    }
    const computed = sceneSpans(p, scene, show, stored);
    const entry: SpansEntry = {
      scene, stored, doc: p.scriptDocument, showSuggestions: show,
      cast: p.castMembers, elements: p.breakdownElements, custom: p.customCategories, labels: p.categoryLabels,
      spans: hit && sceneSpansEqual(hit.spans, computed) ? hit.spans : computed,
    };
    cache.set(sceneId, entry);
    return entry.spans;
  }, []);

  const annotationsForScene = useCallback((sceneId: string | undefined): ScriptAnnotation[] => {
    if (!sceneId) return NO_ANNOTATIONS;
    return spansFor(sceneId)?.annotations ?? NO_ANNOTATIONS;
  }, [spansFor]);

  const handleSelectionEnd = useCallback(() => {
    window.setTimeout(() => {
      if (locked) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        selectionRangeRef.current = null;
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
      const exact = (a: ScriptAnnotation) => a.sceneId === sceneId && a.blockIndex === blockIndex && a.start === start && a.end === end;
      const existing = (projectRef.current.scriptAnnotations || []).find(exact);
      const spans = spansFor(sceneId);
      const derivedMatch = existing ? undefined : spans?.attached.find(exact);
      const suggestionMatch = existing || derivedMatch ? undefined : spans?.suggestions.find(exact);
      selectionRangeRef.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      setTagMenu({
        x: rect.left,
        y: rect.bottom,
        target: { sceneId, blockIndex, start, end, text },
        existing,
        derived: derivedMatch,
        suggestion: suggestionMatch,
        source: 'selection',
      });
    }, 0);
  }, [locked, spansFor]);

  // Keep the native selection highlighted while the selection menu is open:
  // the kit menu focuses its search input on open, which clears the browser
  // selection. Re-apply the saved range while the menu is open, drop it on close.
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
    const onFocusIn = () => restore();
    document.addEventListener('focusin', onFocusIn);
    const raf = requestAnimationFrame(restore);
    const settle = window.setTimeout(restore, 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [tagMenu]);

  const openAnnotation = useCallback((annotation: ScriptAnnotation, event?: React.MouseEvent) => {
    if (locked) return;
    setHovered(null);
    selectionRangeRef.current = null;
    const existing = (project.scriptAnnotations || []).find(a => a.id === annotation.id);
    const isAttached = annotation.id.startsWith('attached:');
    const isSuggestion = annotation.id.startsWith('suggest:');
    setTagMenu({
      x: event?.clientX ?? 0,
      y: event?.clientY ?? 0,
      target: { sceneId: annotation.sceneId, blockIndex: annotation.blockIndex, start: annotation.start, end: annotation.end, text: annotation.text },
      existing,
      derived: !existing && isAttached ? annotation : undefined,
      suggestion: !existing && !isAttached && isSuggestion ? annotation : undefined,
      source: 'annotation',
    });
  }, [locked, project.scriptAnnotations]);

  const handleAnnotationHover = useCallback((annotation: ScriptAnnotation | null, event?: React.MouseEvent) => {
    if (!annotation) { setHovered(null); return; }
    setHovered({ annotation, x: event?.clientX ?? 0, y: event?.clientY ?? 0 });
  }, []);

  const onCommit = useCallback((category: string) => {
    if (!tagMenu || locked) return;
    const { target, existing, derived, suggestion } = tagMenu;
    // Reuse the anchored element (stored annotation, attached span or
    // suggestion); a fresh selection becomes a new element from its text.
    const previous: TagExisting | undefined = existing
      ? { category: existing.category, elementKey: existing.elementKey, id: existing.id }
      : derived
        ? { category: derived.category, elementKey: derived.elementKey }
        : suggestion
          ? { category: suggestion.category, elementKey: suggestion.elementKey }
          : undefined;
    commitTag(dispatch, project, target, category, previous, queueCastNaming);
    setTagMenu(null);
  }, [tagMenu, locked, dispatch, project, queueCastNaming]);

  const onRemove = useCallback(() => {
    if (!tagMenu) return;
    const anchor = tagMenu.existing || tagMenu.derived;
    if (anchor && !locked) detachTag(dispatch, project, tagMenu.target.sceneId, anchor.category, anchor.elementKey);
    setTagMenu(null);
  }, [tagMenu, locked, dispatch, project]);

  const closeMenu = useCallback(() => setTagMenu(null), []);

  return {
    annotationsForScene, tagMenu, hovered, showSuggestions, setShowSuggestions,
    handleSelectionEnd, handleAnnotationHover, openAnnotation, onCommit, onRemove, closeMenu,
  };
}

/** The floating menu + hover badge for a tagging surface. */
export function ScriptTagOverlay({ tagging, project }: { tagging: ScriptTaggingApi; project: Project }) {
  const { tagMenu, hovered } = tagging;
  const badge = hovered && (() => {
    const a = hovered.annotation;
    const name = annotationElementName(project, a);
    const diverged = name.trim().toUpperCase() !== a.text.trim().toUpperCase();
    const custom = (project.customCategories || []).find(c => c.key === a.category);
    const Icon = custom ? getCustomIcon(custom.icon || 'Tag') : (CAT_ICONS[a.category] || null);
    const detail = (
      <span className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: annotationColor(a.category) }} />}
        <span className="font-semibold">{annotationCategoryLabel(project, a.category)}</span>
        <span className="text-zinc-500">·</span>
        <span>{name}</span>
        {diverged && <span className="text-zinc-400">script: “{a.text}”</span>}
      </span>
    );
    return (
      <div data-testid={TEST_IDS.scriptTagBadge} className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-2.5 py-1.5 text-[11px] text-zinc-200 shadow-2xl backdrop-blur-md">
        {a.recognized
          ? (
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-amber-400">Maybe:</span>
              {detail}
            </span>
          )
          : detail}
      </div>
    );
  })();
  return (
    <>
      <ScriptTagMenu menu={tagMenu} project={project} onCommit={tagging.onCommit} onRemove={tagging.onRemove} onClose={tagging.closeMenu} />
      <FloatingTooltip open={!!hovered && !tagMenu} anchor={hovered ? { x: hovered.x, y: hovered.y } : null}>
        {badge}
      </FloatingTooltip>
    </>
  );
}
