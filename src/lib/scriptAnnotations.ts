import type { ScriptAnnotation } from '../types';

/**
 * Screenplay tag annotations (roadmap 123 Phase 2 / 132 Part B) — the shared
 * pure helpers: a deterministic category colour, block-span segmentation for
 * the renderer, and the element-rename cascade. One source of truth so the
 * Script view, the preview pane and any future surface colour/anchor tags
 * identically.
 */

/** Fixed category accents (stable hash → index, so a category keeps its colour
 *  across scenes/surfaces without storing it). */
const ANNOTATION_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6',
  '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

export function annotationColor(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return ANNOTATION_COLORS[hash % ANNOTATION_COLORS.length];
}

export interface AnnotationRange {
  start: number;
  end: number;
  annotation: ScriptAnnotation;
}

/** The tag spans on one block of a scene, in block-text coordinates. */
export function rangesForBlock(annotations: ScriptAnnotation[] | undefined, sceneId: string | undefined, blockIndex: number): AnnotationRange[] {
  if (!annotations || !sceneId) return [];
  return annotations
    .filter(a => a.sceneId === sceneId && a.blockIndex === blockIndex)
    .map(a => ({ start: a.start, end: a.end, annotation: a }));
}

export interface TextSegment {
  text: string;
  annotation?: ScriptAnnotation;
}

/** Split `text` into non-overlapping segments, tagging the ranges that fall on
 *  it. Overlapping tags are clipped to the earlier one (a word is tagged once). */
export function segmentsFor(text: string, ranges: AnnotationRange[]): TextSegment[] {
  if (!text) return [{ text }];
  const clipped = ranges
    .map(r => ({ start: Math.max(0, r.start), end: Math.min(text.length, r.end), annotation: r.annotation }))
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  if (clipped.length === 0) return [{ text }];
  const out: TextSegment[] = [];
  let pos = 0;
  for (const r of clipped) {
    const start = Math.max(r.start, pos);
    if (start > pos) out.push({ text: text.slice(pos, start) });
    if (r.end > start) out.push({ text: text.slice(start, r.end), annotation: r.annotation });
    pos = Math.max(pos, r.end);
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

/** Elements are keyed by id (cast) or name (every other category) — mirror the
 *  domain rule when matching an annotation's element. */
export function annotationElementMatches(annotation: ScriptAnnotation, category: string, key: string): boolean {
  if (annotation.category !== category) return false;
  return annotation.elementKey.toLowerCase() === key.toLowerCase();
}

/** Element rename cascade (matched to `caseUpdateElement`): the SAME batch
 *  updates every annotation pointing at the renamed element, so a name-keyed
 *  tag never dangles (cast is id-keyed and safe unless its id changes). */
export function cascadeAnnotationRename(
  annotations: ScriptAnnotation[] | undefined,
  category: string,
  oldKey: string,
  newKey: string,
): ScriptAnnotation[] | undefined {
  if (!annotations || annotations.length === 0) return annotations;
  return annotations.map(a => (annotationElementMatches(a, category, oldKey) ? { ...a, elementKey: newKey } : a));
}
