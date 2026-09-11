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
 * return a parsed `ImportResult` that the shared `ImportDialog` reviews
 * (rename, cast Board IDs, categories, heading mapping) before building;
 * `.lemon`/`.json` pass through (migrations run in `importProjectFromData`).
 */

export function fileBaseTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Imported Project';
}

/** Build a complete Project from an append-style ImportResult. `opts` carries
 *  the review choices; defaults reproduce the pre-review behavior. */
export function buildProjectFromImport(
  result: ImportResult,
  title: string,
  fileBase: string,
  opts?: { castIdMap?: Map<string, string>; newCustomCategories?: string[] },
): Project {
  const castIdMap = opts?.castIdMap
    ?? buildCastIdMap([...result.characters].sort((a, b) => b.scenes.length - a.scenes.length), []);
  let state: State = { past: [], present: makeBlankProject(title || result.title || fileBase), future: [], _batchDepth: 0 };
  commitImport({
    dispatch: (action) => { state = reducer(state, action); },
    result,
    castIdMap,
    newCustomCategories: opts?.newCustomCategories ?? result.unknownCategories,
    existingCastMembers: [],
    projectTitle: title || result.title || fileBase,
  });
  return state.present;
}

/** Result of picking a new-project import file: a ready Project (`.lemon`,
 *  `.json`, MSD, SEX) or a parsed script to review first (FDX, Fountain, CSV). */
export type NewProjectFile =
  | { kind: 'project'; project: Project }
  | { kind: 'script'; result: ImportResult; fileName: string };

/** Parse any supported new-project import file. Throws on invalid JSON. */
export async function parseNewProjectFile(file: File): Promise<NewProjectFile> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const base = fileBaseTitle(file.name);

  if (ext === 'msd') return { kind: 'project', project: await parseMsdFile(file, base) };
  if (ext === 'sex') return { kind: 'project', project: await parseSexFile(file, base) };
  if (ext === 'fdx') return { kind: 'script', result: await parseFDX(file), fileName: file.name };
  if (ext === 'fountain' || ext === 'txt') return { kind: 'script', result: await parseFountain(file), fileName: file.name };

  const text = await file.text();
  if (ext === 'csv') {
    return { kind: 'script', result: await parseCSV(file, [], [], {}), fileName: file.name };
  }
  // .lemon / .json — a serialized Project.
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('scenes' in data) || !('versions' in data)) {
    throw new Error('Missing scenes or versions.');
  }
  return { kind: 'project', project: data as Project };
}

/** Extensions the new-project import accepts (PM + File menu, desktop picker). */
export const NEW_PROJECT_ACCEPT = '.lemon,.json,.msd,.sex,.fdx,.fountain,.txt,.csv';
