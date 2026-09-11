import { makeBlankProject, reducer } from '../../store/reducer';
import type { State } from '../../store/reducer';
import type { Project } from '../../types';
import { commitImport } from './commitImport';
import { buildCastIdMap } from './castIds';
import { parseFDX } from './fdx';
import { parseFountain } from './fountain';
import { parseCSV } from './csv';
import { parseMsdFile } from './msd';
import { parseSexFile } from './sex';
import type { ImportResult } from './shared';

/**
 * New-project import for the Project Manager / File menu (roadmap 126) — ONE
 * dispatcher for parser selection + accept list, so the PM and the File menu
 * don't carry two copies. MSD/SEX build a complete Project; FDX/Fountain/CSV
 * build one by replaying `commitImport` through the reducer (same commit path
 * as the append flow); `.lemon`/`.json` pass through (migrations run in
 * `importProjectFromData`).
 */

export function fileBaseTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Imported Project';
}

/** Build a complete Project from an append-style ImportResult (new project). */
export function buildProjectFromImport(result: ImportResult, title: string, fileBase: string): Project {
  const castIdMap = buildCastIdMap([...result.characters].sort((a, b) => b.scenes.length - a.scenes.length), []);
  let state: State = { past: [], present: makeBlankProject(title || result.title || fileBase), future: [], _batchDepth: 0 };
  commitImport({
    dispatch: (action) => { state = reducer(state, action); },
    result,
    castIdMap,
    newCustomCategories: result.unknownCategories,
    existingCastMembers: [],
    projectTitle: title || result.title || fileBase,
  });
  return addUnknownHeadingOptions(state.present);
}

/** A new project from a script has no prompt step (PM/File new-project build the
 *  Project directly) — fold any unknown INT/EXT or day/night values into the
 *  Colors options so custom/localized values are preserved, never dropped. */
function addUnknownHeadingOptions(project: Project): Project {
  const palette = project.colorPalette;
  if (!palette) return project;
  const ie = new Set(palette.intExtOptions.map(v => v.toUpperCase()));
  const dn = new Set(palette.dayNightOptions.map(v => v.toUpperCase()));
  const addIE: string[] = [];
  const addDN: string[] = [];
  for (const s of project.scenes) {
    const a = (s.intExt || '').toUpperCase();
    if (a && !ie.has(a)) { ie.add(a); addIE.push(a); }
    const b = (s.dayNight || '').toUpperCase();
    if (b && !dn.has(b)) { dn.add(b); addDN.push(b); }
  }
  if (addIE.length === 0 && addDN.length === 0) return project;
  return {
    ...project,
    colorPalette: {
      ...palette,
      intExtOptions: [...palette.intExtOptions, ...addIE],
      dayNightOptions: [...palette.dayNightOptions, ...addDN],
    },
  };
}

/** Parse any supported import file into a Project. Throws on invalid JSON. */
export async function buildNewProjectFromFile(file: File): Promise<Project> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const base = fileBaseTitle(file.name);

  if (ext === 'msd') return parseMsdFile(file, base);
  if (ext === 'sex') return parseSexFile(file, base);
  if (ext === 'fdx') return buildProjectFromImport(await parseFDX(file), '', base);
  if (ext === 'fountain' || ext === 'txt') return buildProjectFromImport(await parseFountain(file), '', base);

  const text = await file.text();
  if (ext === 'csv') {
    const result = await parseCSV(file, [], [], {});
    return buildProjectFromImport(result, '', base);
  }
  // .lemon / .json — a serialized Project.
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('scenes' in data) || !('versions' in data)) {
    throw new Error('Missing scenes or versions.');
  }
  return data as Project;
}

/** Extensions the new-project import accepts (PM + File menu, desktop picker). */
export const NEW_PROJECT_ACCEPT = '.lemon,.json,.msd,.sex,.fdx,.fountain,.txt,.csv';
