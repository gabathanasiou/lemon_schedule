import { Scene } from '../types';
import { generateUUID } from './utils';

/**
 * Creates a blank Scene with all built-in fields initialized.
 * Shared by GlideBreakdownTab (add row / paste / insert / duplicate) and
 * the import pipeline so the blank shape lives in exactly one place.
 */
export function createBlankScene(partial?: Partial<Scene>): Scene {
  return {
    id: generateUUID(),
    sceneNumber: '',
    pageCount: '',
    pageCountDecimal: 0,
    scriptDay: '',
    intExt: '' as any,
    set: '',
    location: '',
    dayNight: '' as any,
    description: '',
    cast: '',
    notes: '',
    backgroundActors: '',
    stunts: '',
    vehicles: '',
    props: '',
    wardrobe: '',
    makeup: '',
    sfx: '',
    vfx: '',
    sound: '',
    music: '',
    animalsAndWranglers: '',
    weapons: '',
    greenery: '',
    artDept: '',
    ...(partial || {}),
  };
}

/** Next number after a scene number: "12A" → "13"; '' when it doesn't start
 *  with digits. Shared by the Breakdown Glide new-row flow and the Boneyard
 *  New Scene modal (roadmap 227). */
export function getNextSceneNumber(prevSceneNumber?: string): string {
  if (!prevSceneNumber) return '';
  const match = prevSceneNumber.match(/^(\d+)/);
  if (!match) return '';
  return String(parseInt(match[1], 10) + 1);
}
