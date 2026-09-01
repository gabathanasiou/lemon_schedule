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
