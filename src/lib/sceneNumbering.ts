import { Scene } from '../types';
import { normalizeSceneNumber } from './script';

/**
 * The other scene that already uses `newNumber` (compared normalized), or
 * undefined when the number is free.
 *
 * The retained script body attaches to a scene by its normalized number
 * (`scriptSceneOf`/`scriptSceneBlocks` `.find`; `ScriptView`'s last-wins
 * `sceneByIdentity` Map), so two scenes on one number silently share a body and
 * one becomes unreachable. Callers warn + offer a swap instead of applying the
 * edit. An empty (or non-alphanumeric) number never collides.
 */
export function findSceneNumberCollision(
  scenes: Scene[],
  sceneId: string,
  newNumber: string,
): Scene | undefined {
  const target = normalizeSceneNumber(newNumber);
  if (!target) return undefined;
  return scenes.find(s => s.id !== sceneId && normalizeSceneNumber(s.sceneNumber) === target);
}
