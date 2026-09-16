import type { Project, Scene, ScriptScene } from '../types';
import { scriptSceneOf } from './script';
import { nextLetterSceneNumber } from './sceneNumbering';
import { generateUUID } from './utils';

/**
 * Scene duplication (roadmap 132 Part D) — ONE builder for the three duplicate
 * flows (stripboard / Glide / Scene Sheet) and the shared modal.
 */
export type DuplicateMode = 'split' | 'coverage' | 'plain';

export interface SceneDuplicateResult {
  scene: Scene;
  /** For `split`: the retained-body scene to add under the new number. */
  scriptScene?: ScriptScene;
}

/** Build a duplicate of `parent`. `split` renumbers (`6` → `6A`) and copies the
 *  body; `coverage` keeps the number (schedule-only copy with a badge); `plain`
 *  renumbers with no metadata. */
export function buildSceneDuplicate(project: Project, parent: Scene, mode: DuplicateMode): SceneDuplicateResult {
  const id = generateUUID();
  if (mode === 'coverage') {
    return { scene: { ...parent, id, duplicateOf: parent.id, duplicateKind: 'coverage' } };
  }
  const newNumber = nextLetterSceneNumber(project.scenes, parent.sceneNumber);
  const scene: Scene = {
    ...parent,
    id,
    sceneNumber: newNumber,
    ...(mode === 'split' ? { duplicateOf: parent.id, duplicateKind: 'split' as const } : {}),
  };
  if (mode === 'split') {
    const src = scriptSceneOf(project.scriptDocument, parent.sceneNumber);
    if (src) return { scene, scriptScene: { sceneNumber: newNumber, blocks: src.blocks.map(b => [...b] as typeof b) } };
  }
  return { scene };
}
