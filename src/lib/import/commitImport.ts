import { CastMember } from '../../types';
import { ImportResult } from './shared';
import { buildNewScene } from './sceneFields';
import { emitImportSetup, collectImportedSets } from './commitShared';

export interface CommitImportParams {
  dispatch: (action: any) => void;
  result: ImportResult;
  castIdMap: Map<string, string>;
  newCustomCategories: string[];
  existingCastMembers: CastMember[];
  projectTitle?: string;
  reEnableCategories?: string[];
  existingCustomCategoryKeys?: string[];
}

/** Append import: every parsed scene becomes a new scene (fresh ids), landing
 *  in the boneyard. Batches all dispatches into ONE undo entry. */
export function commitImport({
  dispatch,
  result,
  castIdMap,
  newCustomCategories,
  existingCastMembers,
  projectTitle,
  reEnableCategories = [],
  existingCustomCategoryKeys = [],
}: CommitImportParams): void {
  dispatch({ type: 'BATCH_START' });
  try {
    if (projectTitle) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { title: projectTitle } });
    }
    emitImportSetup({
      dispatch,
      result,
      castIdMap,
      newCustomCategories,
      existingCastMembers,
      reEnableCategories,
      existingCustomCategoryKeys,
    });

    const importedSets = new Set<string>();
    for (const ps of result.scenes) {
      for (const name of collectImportedSets(ps)) importedSets.add(name);
      dispatch({ type: 'ADD_SCENE', payload: buildNewScene(ps, castIdMap) });
    }
    for (const name of importedSets) {
      dispatch({ type: 'ADD_ELEMENT', payload: { category: 'set', element: { id: name, name } } });
    }
    // Retained screenplay body (roadmap 123 Phase 0) — the parser emitted it in
    // the same pass; the previous current body becomes scriptBaseline (reducer).
    if (result.script) {
      dispatch({ type: 'SET_SCRIPT_DOCUMENT', payload: { document: result.script } });
    }
  } finally {
    dispatch({ type: 'BATCH_COMMIT' });
  }
}
