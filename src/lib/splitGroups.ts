import type { Action } from '../store/reducer';
import type { Project, Scene } from '../types';
import { normalizeSceneNumber, scriptSceneOf } from './script';

/**
 * Split groups + Split Manager (roadmap 132 Part E). A group is an original
 * scene plus its cut fragments, keyed by scene ID (never number — coverage
 * duplicates share a number). Derived from `duplicateOf`/`duplicateKind`.
 */
export interface SplitGroup {
  original: Scene;
  fragments: Scene[];
}

export function splitGroups(scenes: Scene[]): SplitGroup[] {
  const groups: SplitGroup[] = [];
  for (const original of scenes) {
    const fragments = scenes.filter(s => s.duplicateOf === original.id && s.duplicateKind === 'split');
    if (fragments.length) groups.push({ original, fragments });
  }
  return groups;
}

export type SplitBadge = 'clean' | 'diverged';

/** Clean when every scene in the group still has a retained body; diverged when
 *  one lost its body (deleted/edited out of band). */
export function splitGroupBadge(project: Project, group: SplitGroup): SplitBadge {
  const has = (s: Scene) => !!scriptSceneOf(project.scriptDocument, s.sceneNumber);
  return has(group.original) && group.fragments.every(has) ? 'clean' : 'diverged';
}

/** Merge a whole split group back into the original: append every fragment's
 *  body (dropping each heading), delete the fragment scenes (→ Trash), and move
 *  their tags onto the original. ONE undo batch. */
export function mergeSplitGroup(dispatch: (a: Action) => void, project: Project, originalId: string): boolean {
  const doc = project.scriptDocument;
  const group = splitGroups(project.scenes).find(g => g.original.id === originalId);
  if (!doc || !group) return false;
  const origDoc = scriptSceneOf(doc, group.original.sceneNumber);
  if (!origDoc) return false;

  const fragNumbers = new Set(group.fragments.map(s => normalizeSceneNumber(s.sceneNumber)));
  const fragDocScenes = doc.scenes.filter(s => fragNumbers.has(normalizeSceneNumber(s.sceneNumber)));
  if (fragDocScenes.length === 0) return false;

  // Block-index remap for moved tags: each fragment's tail starts at the current
  // merged length (the +1 offset inside a fragment skips its heading block).
  const offsets = new Map<string, number>();
  let length = origDoc.blocks.length;
  const tailBlocks: typeof origDoc.blocks = [];
  for (const fs of fragDocScenes) {
    offsets.set(normalizeSceneNumber(fs.sceneNumber), length);
    const tail = fs.blocks.filter((b, i) => !(i === 0 && b[0] === 'heading'));
    tailBlocks.push(...tail);
    length += tail.length;
  }

  const merged = { ...origDoc, blocks: [...origDoc.blocks, ...tailBlocks] };
  const newScenes = doc.scenes
    .filter(s => !fragNumbers.has(normalizeSceneNumber(s.sceneNumber)))
    .map(s => (s === origDoc ? merged : s));

  dispatch({ type: 'BATCH_START' });
  dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes: newScenes } } });
  const fragmentIds = new Set(group.fragments.map(s => s.id));
  for (const s of group.fragments) dispatch({ type: 'DELETE_SCENE', payload: s.id });
  for (const a of project.scriptAnnotations || []) {
    if (!fragmentIds.has(a.sceneId) || a.blockIndex < 1) continue;
    const frag = group.fragments.find(s => s.id === a.sceneId);
    if (!frag) continue;
    const base = offsets.get(normalizeSceneNumber(frag.sceneNumber));
    if (base == null) continue;
    dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: a.id, updates: { sceneId: group.original.id, blockIndex: base + (a.blockIndex - 1) } } });
  }
  dispatch({ type: 'BATCH_COMMIT' });
  return true;
}
