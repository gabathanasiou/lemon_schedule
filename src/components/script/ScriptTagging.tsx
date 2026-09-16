import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FloatingTooltip } from '../FloatingTooltip';
import ScriptTagMenu, { type ScriptTagMenuState } from './ScriptTagMenu';
import { useProject } from '../../store';
import { annotationColor } from '../../lib/scriptAnnotations';
import { annotationCategoryLabel, annotationElementName, commitTag, suggestionRanges } from '../../lib/scriptTagging';
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

  const suggestions = useMemo(() => {
    if (!showSuggestions || !project.scriptDocument) return [];
    const out: ScriptAnnotation[] = [];
    for (const s of project.scriptDocument.scenes) {
      const live = sceneByIdentity.get(normalizeSceneNumber(s.sceneNumber));
      if (!live) continue;
      out.push(...suggestionRanges(project, projectScenes[live.index]));
    }
    return out;
  }, [showSuggestions, project, sceneByIdentity, projectScenes]);

  const annotations = useMemo(() => {
    const stored = project.scriptAnnotations || [];
    const committed = stored.filter(a => !a.recognized);
    const nonCommitted = showSuggestions ? stored.filter(a => a.recognized) : [];
    return [...committed, ...nonCommitted, ...(showSuggestions ? suggestions : [])];
  }, [project.scriptAnnotations, showSuggestions, suggestions]);

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
      const existing = (project.scriptAnnotations || []).find(
        a => a.sceneId === sceneId && a.blockIndex === blockIndex && a.start === start && a.end === end,
      );
      selectionRangeRef.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      setTagMenu({ x: rect.left, y: rect.bottom, target: { sceneId, blockIndex, start, end, text }, existing, source: 'selection' });
    }, 0);
  }, [readOnly, project.scriptAnnotations]);

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
    setTagMenu({
      x: event?.clientX ?? 0,
      y: event?.clientY ?? 0,
      target: { sceneId: annotation.sceneId, blockIndex: annotation.blockIndex, start: annotation.start, end: annotation.end, text: annotation.text },
      existing,
      suggested: existing ? undefined : annotation.category,
      source: 'annotation',
    });
  }, [readOnly, project.scriptAnnotations]);

  const handleAnnotationHover = useCallback((annotation: ScriptAnnotation | null, event?: React.MouseEvent) => {
    if (!annotation) { setHovered(null); return; }
    setHovered({ annotation, x: event?.clientX ?? 0, y: event?.clientY ?? 0 });
  }, []);

  const onCommit = useCallback((category: string) => {
    if (!tagMenu || readOnly) return;
    const { target, existing } = tagMenu;
    commitTag(dispatch, project, target, category, existing);
    setTagMenu(null);
  }, [tagMenu, readOnly, dispatch, project]);

  const onRemove = useCallback(() => {
    if (!tagMenu) return;
    if (tagMenu.existing && !readOnly) dispatch({ type: 'REMOVE_SCRIPT_ANNOTATION', payload: tagMenu.existing.id });
    setTagMenu(null);
  }, [tagMenu, readOnly, dispatch]);

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
