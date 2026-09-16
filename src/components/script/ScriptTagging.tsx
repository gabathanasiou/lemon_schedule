import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FloatingTooltip } from '../FloatingTooltip';
import ScriptTagMenu, { type ScriptTagMenuState } from './ScriptTagMenu';
import { useProject } from '../../store';
import { annotationColor } from '../../lib/scriptAnnotations';
import { annotationCategoryLabel, annotationElementName, attachedRanges, commitTag, detachTag, suggestionRanges, type TagExisting } from '../../lib/scriptTagging';
import { normalizeSceneNumber } from '../../lib/script';
import { usePersistState } from '../../lib/persist';
import { TEST_IDS } from '../../lib/testIds';
import type { Project, ScriptAnnotation } from '../../types';

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
  /** Committed (solid) + non-committed (dotted) spans, toggle-gated. */
  annotations: ScriptAnnotation[];
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

export function useScriptTagging(): ScriptTaggingApi {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const [showSuggestions, setShowSuggestions] = usePersistState('lemon_schedule_script_suggestions', true);
  const [tagMenu, setTagMenu] = useState<ScriptTagMenuState | null>(null);
  const [hovered, setHovered] = useState<{ annotation: ScriptAnnotation; x: number; y: number } | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);

  const projectScenes = project.scenes;
  const sceneByIdentity = useMemo(() => {
    const map = new Map<string, { id: string; index: number }>();
    projectScenes.forEach((s, index) => map.set(normalizeSceneNumber(s.sceneNumber), { id: s.id, index }));
    return map;
  }, [projectScenes]);

  // Derived spans: attached elements (solid, always) + suggestions (wavy, gated).
  const derived = useMemo(() => {
    if (!project.scriptDocument) return { attached: [] as ScriptAnnotation[], suggestions: [] as ScriptAnnotation[] };
    const attached: ScriptAnnotation[] = [];
    const suggestions: ScriptAnnotation[] = [];
    for (const s of project.scriptDocument.scenes) {
      const live = sceneByIdentity.get(normalizeSceneNumber(s.sceneNumber));
      if (!live) continue;
      const scene = projectScenes[live.index];
      const sceneAttached = attachedRanges(project, scene);
      attached.push(...sceneAttached);
      if (showSuggestions) suggestions.push(...suggestionRanges(project, scene, sceneAttached));
    }
    return { attached, suggestions };
  }, [showSuggestions, project, sceneByIdentity, projectScenes]);

  const annotations = useMemo(() => {
    const stored = project.scriptAnnotations || [];
    // Priority per range: stored committed → attached (solid) → recognized seeds
    // and suggestions (wavy, toggle-gated).
    const committed = stored.filter(a => !a.recognized);
    const recognized = showSuggestions ? stored.filter(a => a.recognized) : [];
    return [
      ...committed,
      ...derived.attached,
      ...recognized,
      ...(showSuggestions ? derived.suggestions : []),
    ];
  }, [project.scriptAnnotations, showSuggestions, derived]);

  const handleSelectionEnd = useCallback(() => {
    window.setTimeout(() => {
      if (readOnly) return;
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
      const existing = (project.scriptAnnotations || []).find(exact);
      const derivedMatch = existing ? undefined : derived.attached.find(exact);
      const suggestionMatch = existing || derivedMatch ? undefined : derived.suggestions.find(exact);
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
  }, [readOnly, project.scriptAnnotations, derived]);

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
    if (readOnly) return;
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
  }, [readOnly, project.scriptAnnotations]);

  const handleAnnotationHover = useCallback((annotation: ScriptAnnotation | null, event?: React.MouseEvent) => {
    if (!annotation) { setHovered(null); return; }
    setHovered({ annotation, x: event?.clientX ?? 0, y: event?.clientY ?? 0 });
  }, []);

  const onCommit = useCallback((category: string) => {
    if (!tagMenu || readOnly) return;
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
    commitTag(dispatch, project, target, category, previous);
    setTagMenu(null);
  }, [tagMenu, readOnly, dispatch, project]);

  const onRemove = useCallback(() => {
    if (!tagMenu) return;
    const anchor = tagMenu.existing || tagMenu.derived;
    if (anchor && !readOnly) detachTag(dispatch, project, tagMenu.target.sceneId, anchor.category, anchor.elementKey);
    setTagMenu(null);
  }, [tagMenu, readOnly, dispatch, project]);

  const closeMenu = useCallback(() => setTagMenu(null), []);

  return {
    annotations, tagMenu, hovered, showSuggestions, setShowSuggestions,
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
  return (
    <>
      <ScriptTagMenu menu={tagMenu} project={project} onCommit={tagging.onCommit} onRemove={tagging.onRemove} onClose={tagging.closeMenu} />
      <FloatingTooltip open={!!hovered && !tagMenu} anchor={hovered ? { x: hovered.x, y: hovered.y } : null}>
        {badge}
      </FloatingTooltip>
    </>
  );
}
