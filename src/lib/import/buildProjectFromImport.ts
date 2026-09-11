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
import { collectUnknownHeadingValuesOfProject } from './headingValues';
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
  return state.present;
}

/** A parsed new-project import plus any custom/localized heading values the
 *  fresh project doesn't know yet. The caller prompts with `HeadingValueMapper`
 *  (mapping via `applyHeadingMappingToProject`) before committing — same flow as
 *  append/diff, never a silent fold. Project/schedule files carry no prompt. */
export interface NewProjectImport {
  project: Project;
  unknown: { intExt: string[]; dayNight: string[] };
}

const NO_UNKNOWN = { intExt: [] as string[], dayNight: [] as string[] };

const scriptImport = (project: Project): NewProjectImport => ({
  project,
  unknown: collectUnknownHeadingValuesOfProject(project),
});

/** Parse any supported import file into a Project. Throws on invalid JSON. */
export async function buildNewProjectFromFile(file: File): Promise<NewProjectImport> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const base = fileBaseTitle(file.name);

  if (ext === 'msd') return { project: await parseMsdFile(file, base), unknown: NO_UNKNOWN };
  if (ext === 'sex') return { project: await parseSexFile(file, base), unknown: NO_UNKNOWN };
  if (ext === 'fdx') return scriptImport(buildProjectFromImport(await parseFDX(file), '', base));
  if (ext === 'fountain' || ext === 'txt') return scriptImport(buildProjectFromImport(await parseFountain(file), '', base));

  const text = await file.text();
  if (ext === 'csv') {
    return scriptImport(buildProjectFromImport(await parseCSV(file, [], [], {}), '', base));
  }
  // .lemon / .json — a serialized Project.
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('scenes' in data) || !('versions' in data)) {
    throw new Error('Missing scenes or versions.');
  }
  return { project: data as Project, unknown: NO_UNKNOWN };
}

/** Extensions the new-project import accepts (PM + File menu, desktop picker). */
export const NEW_PROJECT_ACCEPT = '.lemon,.json,.msd,.sex,.fdx,.fountain,.txt,.csv';
