import type { Project, ScriptBlock, ScriptDocument, ScriptScene } from '../../types';
import { normalizeSceneNumber, scriptSceneOf } from '../script';
import { splitGroups, type SplitGroup } from '../splitGroups';

/**
 * Import reconciliation for local scene cuts (roadmap 132 Part F). When a
 * revision replaces the retained body, a local split group (`5 → 5 + 5A`) would
 * otherwise lose its fragment bodies (the writer's script only has scene 5). The
 * reviewer picks a per-group action:
 *
 * - `apply-both` — take the revised whole scene and **re-split it at the local
 *   cut** (`cutAnchor` is content-based, so it survives the import), keeping the
 *   cut and distributing the revision across both fragments.
 * - `merge-back` — take the revised whole scene, drop the cut (fragments →
 *   Trash).
 * - `keep` — ignore the revision for this group, preserving the local bodies
 *   exactly (the cut is untouched).
 *
 * Pure: returns a transformed `ScriptDocument` plus the scene ids whose diff
 * decisions must be forced (keep for an ignored group, remove for a merge-back).
 */

export type SplitAction = 'apply-both' | 'merge-back' | 'keep';

export interface ReconcileResult {
  doc: ScriptDocument | undefined;
  /** Scene ids whose entry decision must be forced to `keep`. */
  forceKeep: Set<string>;
  /** Scene ids whose entry decision must be forced to `remove`. */
  forceRemove: Set<string>;
}

const findBlock = (blocks: ScriptBlock[], anchor: string, from: number): number => {
  if (!anchor) return -1;
  for (let i = from; i < blocks.length; i++) {
    if (blocks[i][1] === anchor) return i;
  }
  for (let i = from; i < blocks.length; i++) {
    if (blocks[i][1] && blocks[i][1].includes(anchor)) return i;
  }
  return -1;
};

export function reconcileSplitBodies(
  project: Project,
  incomingDoc: ScriptDocument | undefined,
  actions: Map<string, SplitAction>,
): ReconcileResult {
  const forceKeep = new Set<string>();
  const forceRemove = new Set<string>();
  if (!incomingDoc || actions.size === 0) return { doc: incomingDoc, forceKeep, forceRemove };

  const localDoc = project.scriptDocument;
  const groups = splitGroups(project.scenes);
  let scenes = incomingDoc.scenes.slice();

  for (const group of groups) {
    const action = actions.get(group.original.id);
    if (!action) continue;
    const members = [group.original, ...group.fragments];
    const localScenes = members.map(m => scriptSceneOf(localDoc, m.sceneNumber));
    const idx = scenes.findIndex(s => normalizeSceneNumber(s.sceneNumber) === normalizeSceneNumber(group.original.sceneNumber));

    if (action === 'merge-back') {
      for (const frag of group.fragments) forceRemove.add(frag.id);
      // The incoming whole scene replaces the original; drop any incoming
      // scene that happens to carry a fragment number.
      const fragNumbers = new Set(group.fragments.map(f => normalizeSceneNumber(f.sceneNumber)));
      scenes = scenes.filter(s => !fragNumbers.has(normalizeSceneNumber(s.sceneNumber)));
      continue;
    }

    if (idx < 0) continue;

    if (action === 'keep') {
      for (const m of members) forceKeep.add(m.id);
      const keep = localScenes.filter((s): s is ScriptScene => !!s);
      if (keep.length > 0) scenes.splice(idx, 1, ...keep);
      continue;
    }

    // apply-both: re-split the incoming whole scene at each content anchor.
    const incoming = scenes[idx];
    let cursor = incoming.blocks;
    const fragments: ScriptScene[] = [];
    let ok = true;
    for (const frag of group.fragments) {
      const k = findBlock(cursor, frag.cutAnchor || '', 1);
      if (k < 0) { ok = false; break; }
      const localFrag = scriptSceneOf(localDoc, frag.sceneNumber);
      const heading: ScriptBlock = localFrag?.blocks[0]?.[0] === 'heading' ? localFrag.blocks[0] : ['heading', ''];
      fragments.push({ sceneNumber: frag.sceneNumber, blocks: [heading, ...cursor.slice(k)] });
      cursor = cursor.slice(0, k);
    }
    if (!ok) {
      // Anchor gone from the revision — fall back to keeping the local cut.
      for (const m of members) forceKeep.add(m.id);
      const keep = localScenes.filter((s): s is ScriptScene => !!s);
      if (keep.length > 0) scenes.splice(idx, 1, ...keep);
      continue;
    }
    scenes.splice(idx, 1, { ...incoming, blocks: cursor }, ...fragments);
  }

  return { doc: { ...incomingDoc, scenes }, forceKeep, forceRemove };
}
