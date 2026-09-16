import { CastMember, ScriptAnnotation } from '../../types';
import { ImportResult } from './shared';
import { buildNewScene } from './sceneFields';
import { emitImportSetup, collectImportedSets } from './commitShared';
import { normalizeSceneNumber } from '../script';
import { generateUUID } from '../utils';

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
    const idBySceneNumber = new Map<string, string>();
    for (const ps of result.scenes) {
      for (const name of collectImportedSets(ps)) importedSets.add(name);
      const scene = buildNewScene(ps, castIdMap);
      idBySceneNumber.set(normalizeSceneNumber(ps.sceneNumber), scene.id);
      dispatch({ type: 'ADD_SCENE', payload: scene });
    }
    for (const name of importedSets) {
      dispatch({ type: 'ADD_ELEMENT', payload: { category: 'set', element: { id: name, name } } });
    }
    // Retained screenplay body (roadmap 123 Phase 0) — the parser emitted it in
    // the same pass; the previous current body becomes scriptBaseline (reducer).
    if (result.script) {
      dispatch({ type: 'SET_SCRIPT_DOCUMENT', payload: { document: result.script } });
    }
    // Recognised tags from the imported body (roadmap 132 Part B) — anchored to
    // the freshly-created scenes, dotted until the user commits them. Dispatched
    // AFTER the body (SET drops the old body's positional tags).
    for (const seed of result.annotations || []) {
      const sceneId = idBySceneNumber.get(normalizeSceneNumber(seed.sceneNumber));
      if (!sceneId) continue;
      const annotation: ScriptAnnotation = {
        id: generateUUID(),
        sceneId,
        blockIndex: seed.blockIndex,
        start: seed.start,
        end: seed.end,
        text: seed.text,
        category: seed.category,
        elementKey: seed.elementKey,
        recognized: true,
      };
      dispatch({ type: 'ADD_SCRIPT_ANNOTATION', payload: { annotation } });
    }
  } finally {
    dispatch({ type: 'BATCH_COMMIT' });
  }
}
