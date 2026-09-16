import type { Action } from '../store/reducer';
import type { Project, Scene, ScriptBlock } from '../types';
import { normalizeSceneNumber, scriptSceneOf } from './script';

/**
 * Scene-body operations that combine the retained screenplay with the scene
 * list (roadmap 132 Part C). Each writes ONE undo batch.
 */

/** Cut a scene's body at block boundary `splitIndex` into `newScene` (already
 *  built with id + inherited fields) and land it in the boneyard. */
export function commitSceneCut({
  dispatch,
  project,
  parentId,
  parentNumber,
  newScene,
  splitIndex,
  headingText,
  moveTags,
}: {
  dispatch: (a: Action) => void;
  project: Project;
  parentId: string;
  parentNumber: string;
  newScene: Scene;
  splitIndex: number;
  headingText: string;
  moveTags: boolean;
}): boolean {
  const doc = project.scriptDocument;
  const docScene = doc ? scriptSceneOf(doc, parentNumber) : undefined;
  if (!doc || !docScene || splitIndex < 1 || splitIndex >= docScene.blocks.length) return false;

  const head = docScene.blocks.slice(0, splitIndex);
  const newScriptScene = {
    sceneNumber: newScene.sceneNumber,
    blocks: [['heading', headingText] as ScriptBlock, ...docScene.blocks.slice(splitIndex)],
  };
  const idx = doc.scenes.indexOf(docScene);
  const newScenes = doc.scenes.map(s => (s === docScene ? { ...s, blocks: head } : s));
  newScenes.splice(idx + 1, 0, newScriptScene);

  dispatch({ type: 'BATCH_START' });
  dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes: newScenes } } });
  dispatch({ type: 'ADD_SCENE', payload: newScene });
  if (moveTags) {
    for (const a of project.scriptAnnotations || []) {
      if (a.sceneId === parentId && a.blockIndex >= splitIndex) {
        // +1 for the heading prepended to the new scene.
        dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: a.id, updates: { sceneId: newScene.id, blockIndex: a.blockIndex - splitIndex + 1 } } });
      }
    }
  }
  dispatch({ type: 'BATCH_COMMIT' });
  return true;
}

/** Merge a scene with the NEXT body scene: concatenate the bodies (dropping the
 *  next heading), delete the next live scene (→ Trash, restorable) and move its
 *  tags onto the surviving scene. Reverses a cut. */
export function mergeSceneWithNext(
  dispatch: (a: Action) => void,
  project: Project,
  sceneId: string,
): boolean {
  const doc = project.scriptDocument;
  const live = project.scenes.find(s => s.id === sceneId);
  const docScene = doc && live ? scriptSceneOf(doc, live.sceneNumber) : undefined;
  if (!doc || !live || !docScene) return false;
  const idx = doc.scenes.indexOf(docScene);
  const nextDoc = doc.scenes[idx + 1];
  if (!nextDoc) return false;
  const nextLive = project.scenes.find(s => normalizeSceneNumber(s.sceneNumber) === normalizeSceneNumber(nextDoc.sceneNumber));

  const head = docScene.blocks;
  const tail = nextDoc.blocks.filter((b, i) => !(i === 0 && b[0] === 'heading'));
  const merged = { ...docScene, blocks: [...head, ...tail] };
  const newScenes = doc.scenes.filter((_, i) => i !== idx + 1).map(s => (s === docScene ? merged : s));

  dispatch({ type: 'BATCH_START' });
  dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes: newScenes } } });
  if (nextLive) dispatch({ type: 'DELETE_SCENE', payload: nextLive.id });
  for (const a of project.scriptAnnotations || []) {
    if (nextLive && a.sceneId === nextLive.id && a.blockIndex >= 1) {
      dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: a.id, updates: { sceneId: live.id, blockIndex: head.length + (a.blockIndex - 1) } } });
    }
  }
  dispatch({ type: 'BATCH_COMMIT' });
  return true;
}
