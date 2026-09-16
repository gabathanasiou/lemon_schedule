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

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The next free lettered child of a scene number (`6` → `6A`, already-A →
 *  `6B`). ONE source of truth for duplicate renumbering (stripboard/Glide/Scene
 *  Sheet), the script cut, and the duplicate modal (roadmap 132 Part C/D). */
export function nextLetterSceneNumber(scenes: { sceneNumber: string }[], sceneNumber: string): string {
  const base = sceneNumber.replace(/[A-Z]+$/i, '');
  const used = new Set(
    scenes
      .map(s => s.sceneNumber)
      .filter(n => new RegExp(`^${escapeRegExp(base)}[A-Z]$`, 'i').test(n))
      .map(n => n.slice(-1).toUpperCase()),
  );
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return base + letter;
  }
  return `${base}A`;
}
