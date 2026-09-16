import type { Action } from '../store/reducer';
import type { Project, Scene, ScriptBlock, ScriptScene } from '../types';
import { normalizeSceneNumber, scriptSceneOf, formatSceneHeading } from './script';

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

/** The group's scenes in merge order: original first, then its fragments. */
export function splitGroupMembers(group: SplitGroup): Scene[] {
  return [group.original, ...group.fragments];
}

/** Canonical number base — letters stripped (`5A` → `5`). */
const numberBase = (n: string) => n.replace(/[A-Z]+$/i, '') || n;

const letterAt = (i: number) => String.fromCharCode(65 + ((i - 1) % 26));

/**
 * Normalize a group's scene numbers: the original keeps its base number and the
 * fragments get the next letters in order (`5`, `5A`, `5B`). The retained
 * bodies' `sceneNumber`s are rewritten in the same batch so the script stays
 * attached (the body resolves by number). Aborts (false) when a target number
 * would collide with a scene outside the group, or when nothing changes.
 */
export function renumberSplitGroup(dispatch: (a: Action) => void, project: Project, originalId: string): boolean {
  const group = splitGroups(project.scenes).find(g => g.original.id === originalId);
  if (!group) return false;
  const doc = project.scriptDocument;
  const members = splitGroupMembers(group);
  const groupIds = new Set(members.map(s => s.id));
  const base = numberBase(group.original.sceneNumber);
  const targets = members.map((_, i) => (i === 0 ? base : `${base}${letterAt(i)}`));
  for (let i = 0; i < members.length; i++) {
    const target = normalizeSceneNumber(targets[i]);
    if (project.scenes.some(s => !groupIds.has(s.id) && normalizeSceneNumber(s.sceneNumber) === target)) return false;
  }
  const changed = members.filter((s, i) => s.sceneNumber !== targets[i]);
  if (changed.length === 0) return false;

  const numberBySceneId = new Map(members.map((s, i) => [s.id, targets[i]]));
  dispatch({ type: 'BATCH_START' });
  for (const s of changed) dispatch({ type: 'UPDATE_SCENE', payload: { id: s.id, sceneNumber: numberBySceneId.get(s.id)! } });
  if (doc) {
    const groupDocNumbers = new Set(members.map(s => normalizeSceneNumber(s.sceneNumber)));
    const scenes = doc.scenes.map(ds => {
      if (!groupDocNumbers.has(normalizeSceneNumber(ds.sceneNumber))) return ds;
      const member = members.find(s => normalizeSceneNumber(s.sceneNumber) === normalizeSceneNumber(ds.sceneNumber));
      return member ? { ...ds, sceneNumber: numberBySceneId.get(member.id)! } : ds;
    });
    dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes } } });
  }
  dispatch({ type: 'BATCH_COMMIT' });
  return true;
}

interface MergedGroup {
  merged: ScriptBlock[];
  /** Strictly increasing cumulative tail lengths (original is index 0, then
   *  each fragment's heading-less tail). */
  boundaries: number[];
  /** Absolute merged offset each member's tail starts at. */
  starts: number[];
}

/** Concatenate the group's retained bodies into one stream (fragment headings
 *  dropped). Returns null unless every member has a retained body. */
export function mergedGroupStream(doc: Project['scriptDocument'], group: SplitGroup): MergedGroup | null {
  const members = splitGroupMembers(group);
  const docScenes = members.map(s => (doc ? scriptSceneOf(doc, s.sceneNumber) : undefined));
  if (docScenes.some(s => !s)) return null;
  const merged: ScriptBlock[] = [];
  const boundaries: number[] = [];
  const starts: number[] = [];
  members.forEach((_, i) => {
    starts.push(merged.length);
    const blocks = docScenes[i]!.blocks;
    const tail = i === 0 ? blocks : blocks.filter((b, j) => !(j === 0 && b[0] === 'heading'));
    merged.push(...tail);
    boundaries.push(merged.length);
  });
  return { merged, boundaries, starts };
}

/**
 * Move the cut break between the original and its first fragment: keep
 * `newBoundary` merged blocks in the original, move the rest to the first
 * fragment. Later fragments are untouched. Tag spans travel by absolute merged
 * position (the block content is unchanged), so a tag on a moved block follows
 * it across the cut. ONE batch.
 */
export function moveSplitBreak(dispatch: (a: Action) => void, project: Project, originalId: string, newBoundary: number): boolean {
  const doc = project.scriptDocument;
  const group = splitGroups(project.scenes).find(g => g.original.id === originalId);
  if (!doc || !group || group.fragments.length === 0) return false;
  const stream = mergedGroupStream(doc, group);
  if (!stream) return false;
  const { merged, boundaries } = stream;
  const members = splitGroupMembers(group);
  const docScenes = members.map(s => scriptSceneOf(doc, s.sceneNumber)!);
  const upper = boundaries[1]; // the first fragment must keep ≥ 1 block
  const boundary = Math.max(1, Math.min(newBoundary, upper - 1));
  if (boundary === boundaries[0]) return false;

  const newBounds = [boundary, ...boundaries.slice(1)];
  const newStarts: number[] = [];
  const newDocScenes: ScriptScene[] = members.map((_, i) => {
    const start = i === 0 ? 0 : newBounds[i - 1];
    newStarts.push(start);
    const end = newBounds[i];
    const slice = merged.slice(start, end);
    if (i === 0) return { ...docScenes[i], blocks: slice };
    const heading = docScenes[i].blocks[0]?.[0] === 'heading' ? docScenes[i].blocks[0] : (['heading', formatSceneHeading('', group.fragments[i - 1].set, '')] as ScriptBlock);
    return { ...docScenes[i], blocks: [heading, ...slice] };
  });

  const oldToNew = new Map<ScriptScene, ScriptScene>();
  docScenes.forEach((os, i) => oldToNew.set(os, newDocScenes[i]));
  const scenes = doc.scenes.map(s => oldToNew.get(s) ?? s);

  dispatch({ type: 'BATCH_START' });
  dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes } } });
  const groupIds = new Set(members.map(s => s.id));
  for (const a of project.scriptAnnotations || []) {
    if (!groupIds.has(a.sceneId)) continue;
    const m = members.findIndex(s => s.id === a.sceneId);
    if (m < 0) continue;
    const pos = stream.starts[m] + (m === 0 ? a.blockIndex : a.blockIndex - 1);
    let n = 0;
    while (n < newBounds.length - 1 && pos >= newBounds[n]) n++;
    const blockIndex = n === 0 ? pos : pos - newStarts[n] + 1;
    const sceneId = members[n].id;
    if (sceneId !== a.sceneId || blockIndex !== a.blockIndex) {
      dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: a.id, updates: { sceneId, blockIndex } } });
    }
  }
  dispatch({ type: 'BATCH_COMMIT' });
  return true;
}

/** Locate `text` in a block (exact, then case-insensitive) — local copy so the
 *  split repair never imports the import layer. */
function locate(text: string, blockText: string): { start: number; end: number } | null {
  if (!text) return null;
  const exact = blockText.indexOf(text);
  if (exact >= 0) return { start: exact, end: exact + text.length };
  const lower = blockText.toLowerCase().indexOf(text.toLowerCase());
  return lower >= 0 ? { start: lower, end: lower + text.length } : null;
}

/**
 * Reconcile a group (roadmap 132 Part E): rebuild a missing member body as a
 * heading-only retained scene and re-anchor tags whose stored span no longer
 * matches the block (wording edited out from under the anchor). Returns the
 * number of fixes applied (0 = clean). ONE batch when it changes anything.
 */
export function resolveSplitGroup(dispatch: (a: Action) => void, project: Project, originalId: string): number {
  const doc = project.scriptDocument;
  const group = splitGroups(project.scenes).find(g => g.original.id === originalId);
  if (!doc || !group) return 0;
  const members = splitGroupMembers(group);
  const originalDoc = scriptSceneOf(doc, group.original.sceneNumber);
  if (!originalDoc) return 0;

  let scenes = doc.scenes.slice();
  let anchorIndex = scenes.indexOf(originalDoc);
  let rebuilt = 0;
  const headingOf = (s: Scene) => formatSceneHeading(s.intExt, s.set, s.dayNight);
  for (const frag of group.fragments) {
    const existing = scriptSceneOf(doc, frag.sceneNumber);
    if (existing) {
      const idx = scenes.indexOf(existing);
      if (idx >= 0) anchorIndex = idx;
      continue;
    }
    scenes.splice(anchorIndex + 1, 0, { sceneNumber: frag.sceneNumber, blocks: [['heading', headingOf(frag)]] });
    anchorIndex += 1;
    rebuilt += 1;
  }

  const groupIds = new Set(members.map(s => s.id));
  const annotationUpdates: { id: string; updates: { blockIndex: number; start: number; end: number } }[] = [];
  for (const a of project.scriptAnnotations || []) {
    if (!groupIds.has(a.sceneId)) continue;
    const member = members.find(s => s.id === a.sceneId);
    const docScene = member ? scriptSceneOf({ ...doc, scenes }, member.sceneNumber) : undefined;
    const block = docScene?.blocks[a.blockIndex];
    if (!docScene || !block) continue;
    if (block[1].slice(a.start, a.end) === a.text) continue;
    const found = locate(a.text, block[1]);
    if (found) annotationUpdates.push({ id: a.id, updates: { blockIndex: a.blockIndex, ...found } });
  }

  if (rebuilt === 0 && annotationUpdates.length === 0) return 0;
  dispatch({ type: 'BATCH_START' });
  if (rebuilt > 0) dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes } } });
  for (const u of annotationUpdates) dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: u });
  dispatch({ type: 'BATCH_COMMIT' });
  return rebuilt + annotationUpdates.length;
}
