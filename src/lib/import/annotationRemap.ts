import { diffArrays } from 'diff';
import type { ScriptAnnotation, ScriptBlock, ScriptDocument } from '../../types';
import { scriptSceneOf } from '../script';

/**
 * Annotation remap through an import (roadmap 132 Part F). When a revision
 * replaces the retained body, a tag's positional anchor is still valid if its
 * block survived (rule: unchanged blocks carry spans 1:1); a changed block is
 * re-anchored by its stored text; if the wording is gone the tag is reported
 * orphaned — never silently shifted onto the wrong words.
 */

const blockEqual = (a: ScriptBlock, b: ScriptBlock): boolean => a[0] === b[0] && a[1] === b[1];

/** Old-block index → new-block index for the unchanged (aligned) blocks. */
function blockIndexMap(oldBlocks: ScriptBlock[], newBlocks: ScriptBlock[]): Map<number, number> {
  const map = new Map<number, number>();
  const changes = diffArrays(oldBlocks, newBlocks, { comparator: blockEqual });
  let oi = 0;
  let ni = 0;
  for (const change of changes) {
    const len = change.value.length;
    if (change.removed) oi += len;
    else if (change.added) ni += len;
    else {
      for (let k = 0; k < len; k++) map.set(oi + k, ni + k);
      oi += len;
      ni += len;
    }
  }
  return map;
}

/** Locate `text` in a block (exact, then case-insensitive). */
function locate(text: string, blockText: string): { start: number; end: number } | null {
  if (!text) return null;
  const exact = blockText.indexOf(text);
  if (exact >= 0) return { start: exact, end: exact + text.length };
  const lower = blockText.toLowerCase().indexOf(text.toLowerCase());
  if (lower >= 0) return { start: lower, end: lower + text.length };
  return null;
}

export interface SceneNumberRemap {
  /** The retained-body scene number before the import. */
  oldNumber: string;
  /** The retained-body scene number after the import. */
  newNumber: string;
}

export interface AnnotationRemapResult {
  annotations: ScriptAnnotation[];
  orphaned: number;
}

/** Remap every annotation into the new body. Annotations whose scene is not in
 *  `bySceneId` (added/removed scenes) or whose wording disappeared are dropped
 *  and counted as orphaned. */
export function remapAnnotations(
  annotations: ScriptAnnotation[],
  oldDoc: ScriptDocument | undefined,
  newDoc: ScriptDocument | undefined,
  bySceneId: Map<string, SceneNumberRemap>,
): AnnotationRemapResult {
  const out: ScriptAnnotation[] = [];
  let orphaned = 0;
  for (const annotation of annotations) {
    const plan = bySceneId.get(annotation.sceneId);
    const oldScene = plan ? scriptSceneOf(oldDoc, plan.oldNumber) : undefined;
    const newScene = plan ? scriptSceneOf(newDoc, plan.newNumber) : undefined;
    if (!oldScene || !newScene) { orphaned++; continue; }

    const map = blockIndexMap(oldScene.blocks, newScene.blocks);
    let blockIndex = map.get(annotation.blockIndex);
    let span: { start: number; end: number } | null = null;

    if (blockIndex != null) {
      const block = newScene.blocks[blockIndex];
      const intact = block && block[1].slice(annotation.start, annotation.end) === annotation.text;
      span = intact ? { start: annotation.start, end: annotation.end } : locate(annotation.text, block?.[1] ?? '');
    }
    if (!span) {
      // The block moved/was rewritten — search the whole scene for the wording.
      for (let i = 0; i < newScene.blocks.length; i++) {
        const found = locate(annotation.text, newScene.blocks[i][1]);
        if (found) { blockIndex = i; span = found; break; }
      }
    }
    if (!span || blockIndex == null) { orphaned++; continue; }
    out.push({ ...annotation, blockIndex, start: span.start, end: span.end });
  }
  return { annotations: out, orphaned };
}
