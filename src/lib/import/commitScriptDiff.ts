import { CastMember } from '../../types';
import { ImportResult } from './shared';
import { buildNewScene, buildSceneFields } from './sceneFields';
import { emitImportSetup, collectImportedSets } from './commitShared';
import type { SceneDiffEntry } from './scriptDiff';

/**
 * Per-entry user decision in the script-diff acceptance stage (roadmap 38):
 * - `apply`  modified pair → take the script's field values (keep current id)
 * - `keep`   modified/removed → leave the current scene untouched (default for
 *            removed — the stripboard/schedule investment survives)
 * - `add`    added scene → append to the boneyard
 * - `skip`   unchanged / ignored
 * - `remove` removed scene → delete (goes to trash; user-confirmed)
 */
export type DiffDecision = 'apply' | 'keep' | 'add' | 'skip' | 'remove';

export function defaultDecision(entry: SceneDiffEntry): DiffDecision {
  switch (entry.status) {
    case 'modified': return 'apply';
    case 'added': return 'add';
    case 'removed': return 'keep';
    default: return 'skip';
  }
}

export interface CommitScriptDiffParams {
  dispatch: (action: any) => void;
  result: ImportResult;
  entries: SceneDiffEntry[];
  /** Parallel to `entries`; missing → defaultDecision. */
  decisions: (DiffDecision | undefined)[];
  castIdMap: Map<string, string>;
  newCustomCategories: string[];
  existingCastMembers: CastMember[];
  /** Cast renames detected by the diff: the new name maps to the EXISTING
   *  member id (so the member is renamed, not duplicated). */
  castRenames?: { from: string; to: string }[];
  /** Per-entry set of Scene field keys to KEEP (not take from the script).
   *  Absent/empty = take every changed field (the default). The screenplay
   *  body is always taken from the new script. */
  fieldKeeps?: (Set<string> | undefined)[];
  projectTitle?: string;
  reEnableCategories?: string[];
  existingCustomCategoryKeys?: string[];
}

/** Apply an accepted script diff in place — matched scenes keep their ids (and
 *  their stripboard rows / call times / ribbons); added scenes land in the
 *  boneyard; removals are opt-in. One undo entry for the whole accept. */
export function commitScriptDiff({
  dispatch,
  result,
  entries,
  decisions,
  castIdMap,
  newCustomCategories,
  existingCastMembers,
  castRenames = [],
  fieldKeeps = [],
  projectTitle,
  reEnableCategories = [],
  existingCustomCategoryKeys = [],
}: CommitScriptDiffParams): void {
  dispatch({ type: 'BATCH_START' });
  try {
    if (projectTitle) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { title: projectTitle } });
    }
    // A renamed character keeps its member id: map the new name to the existing
    // id so `emitImportSetup` renames (never adds a duplicate / orphan).
    const resolvedCastIdMap = new Map(castIdMap);
    for (const rename of castRenames) {
      const existing = existingCastMembers.find(c => c.name.toUpperCase() === rename.from.toUpperCase());
      if (existing) resolvedCastIdMap.set(rename.to, String(existing.id));
    }
    emitImportSetup({
      dispatch,
      result,
      castIdMap: resolvedCastIdMap,
      newCustomCategories,
      existingCastMembers,
      reEnableCategories,
      existingCustomCategoryKeys,
    });

    const importedSets = new Set<string>();
    entries.forEach((entry, index) => {
      const decision = decisions[index] ?? defaultDecision(entry);
      if (entry.status === 'modified' && decision === 'apply' && entry.oldScene && entry.newScene) {
        const full = buildSceneFields(entry.newScene, resolvedCastIdMap) as Record<string, unknown>;
        const keep = fieldKeeps[index];
        const patch: Record<string, unknown> = { id: entry.oldScene.id };
        // The number is diffable too — keep yours when unchecking it.
        if (!keep?.has('sceneNumber')) patch.sceneNumber = full.sceneNumber;
        for (const [key, value] of Object.entries(full)) {
          if (key === 'id' || key === 'sceneNumber' || key === 'pageCount' || key === 'pageCountDecimal') continue;
          if (keep?.has(key)) continue; // user keeps their current value for this field
          patch[key] = value;
        }
        if (!keep?.has('pageCount')) {
          if ('pageCount' in full) patch.pageCount = full.pageCount;
          if ('pageCountDecimal' in full) patch.pageCountDecimal = full.pageCountDecimal;
        }
        dispatch({ type: 'UPDATE_SCENE', payload: patch });
        for (const name of collectImportedSets(entry.newScene)) importedSets.add(name);
      } else if (entry.status === 'added' && decision === 'add' && entry.newScene) {
        dispatch({ type: 'ADD_SCENE', payload: buildNewScene(entry.newScene, resolvedCastIdMap) });
        for (const name of collectImportedSets(entry.newScene)) importedSets.add(name);
      } else if (entry.status === 'removed' && decision === 'remove' && entry.oldScene) {
        dispatch({ type: 'DELETE_SCENE', payload: entry.oldScene.id });
      }
    });
    for (const name of importedSets) {
      dispatch({ type: 'ADD_ELEMENT', payload: { category: 'set', element: { id: name, name } } });
    }
    if (result.script) {
      dispatch({ type: 'SET_SCRIPT_DOCUMENT', payload: { document: result.script } });
    }
  } finally {
    dispatch({ type: 'BATCH_COMMIT' });
  }
}
