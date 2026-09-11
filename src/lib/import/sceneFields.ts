import { generateUUID } from '../utils';
import type { Scene } from '../../types';
import type { ParsedScene } from './shared';

/** Built-in Scene fields produced from a parsed screenplay (everything else on
 *  `taggedElements` is a custom/unknown category written through generically). */
export const BUILTIN_SCENE_KEYS = new Set([
  'id', 'sceneNumber', 'scriptPageNumbers', 'pageCount', 'pageCountDecimal', 'scriptDay',
  'intExt', 'set', 'dayNight', 'description', 'cast', 'notes', 'location',
  'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
]);

/** Resolve a parsed scene's character names to cast ids (case-insensitive). */
export function resolveCastIds(ps: ParsedScene, castIdMap: Map<string, string>): string {
  return ps.characters
    .map(name => {
      const upper = name.toUpperCase();
      for (const [original, assigned] of castIdMap) {
        if (original.toUpperCase() === upper) return assigned;
      }
      return '';
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Parsed scene → Scene field values. One source of truth shared by
 * `commitImport` (append, fresh id) and `commitScriptDiff` (in-place updates) —
 * never hand-build the field mapping twice.
 *
 * Page count / script page are OMITTED when the parser has no value for them
 * (CSV, Fountain, FDX without `<SceneProperties>`): an in-place update must not
 * zero out a page count it simply doesn't know — `buildNewScene` fills the
 * defaults for freshly created scenes.
 */
export function buildSceneFields(ps: ParsedScene, castIdMap: Map<string, string>): Partial<Scene> {
  const breakdownFields: Record<string, string> = {};
  for (const [cat, items] of Object.entries(ps.taggedElements)) breakdownFields[cat] = items.join(', ');

  const setName = (breakdownFields.set || ps.set || '').toUpperCase().trim();

  const fields: any = {
    sceneNumber: ps.sceneNumber,
    scriptDay: breakdownFields.scriptDay || '',
    intExt: ps.intExt,
    set: setName || ps.set.toUpperCase(),
    dayNight: ps.dayNight,
    description: breakdownFields.description || '',
    cast: resolveCastIds(ps, castIdMap) || ps.rawCast || '',
    notes: breakdownFields.notes || '',
    location: breakdownFields.location || '',
    backgroundActors: breakdownFields.backgroundActors || '',
    stunts: breakdownFields.stunts || '',
    vehicles: breakdownFields.vehicles || '',
    props: breakdownFields.props || '',
    wardrobe: breakdownFields.wardrobe || '',
    makeup: breakdownFields.makeup || '',
    sfx: breakdownFields.sfx || '',
    vfx: breakdownFields.vfx || '',
    sound: breakdownFields.sound || '',
    music: breakdownFields.music || '',
    animalsAndWranglers: breakdownFields.animalsAndWranglers || '',
    weapons: breakdownFields.weapons || '',
    greenery: breakdownFields.greenery || '',
    artDept: breakdownFields.artDept || '',
  };
  if (ps.scriptPageNumbers) fields.scriptPageNumbers = ps.scriptPageNumbers;
  if (ps.pageCount != null) fields.pageCount = ps.pageCount;
  if (ps.pageCountDecimal != null) fields.pageCountDecimal = ps.pageCountDecimal;

  for (const [key, val] of Object.entries(breakdownFields)) {
    if (!BUILTIN_SCENE_KEYS.has(key)) fields[key] = val;
  }

  return fields as Partial<Scene>;
}

/** New scene (append / boneyard add) from a parsed scene — fresh id + defaults
 *  for the fields the parser didn't provide. */
export function buildNewScene(ps: ParsedScene, castIdMap: Map<string, string>): Scene {
  return {
    id: generateUUID(),
    pageCount: '0',
    pageCountDecimal: 0,
    ...buildSceneFields(ps, castIdMap),
  } as Scene;
}
