import type { HeadingAliases, Project } from '../../types';
import type { ImportResult } from './shared';

/**
 * Custom/localized heading-value mapping (roadmap 127).
 *
 * Scripts carry INT/EXT and day/night values the project doesn't know
 * (localized "ΕΣΩΤ", custom "DREAM"). Import keeps them, then asks once: add as
 * a NEW value (writes to `colorPalette.intExtOptions`/`dayNightOptions` — the
 * Colors tab, the source of truth) or MAP to an existing one (recorded in
 * `project.headingAliases`). Aliases make later re-imports silent.
 */

export type HeadingValueAction = 'add' | 'map';
export interface HeadingValueChoice {
  action: HeadingValueAction;
  /** Canonical value when `action === 'map'`. */
  mapTo?: string;
}
export interface HeadingMapping {
  intExt: Record<string, HeadingValueChoice>;
  dayNight: Record<string, HeadingValueChoice>;
}

const DEFAULT_INT_EXT = ['INT', 'EXT', 'INT/EXT'];
const DEFAULT_DAY_NIGHT = ['DAY', 'NIGHT', 'MORNING', 'EVENING'];

export function knownIntExtValues(project: Project): string[] {
  const opts = project.colorPalette?.intExtOptions;
  return opts && opts.length ? opts : DEFAULT_INT_EXT;
}

export function knownDayNightValues(project: Project): string[] {
  const opts = project.colorPalette?.dayNightOptions;
  return opts && opts.length ? opts : DEFAULT_DAY_NIGHT;
}

/** Uppercased day/night phrases the project already knows (palette options +
 *  alias keys) — fed into the parser so a multi-word value the user has already
 *  accepted re-splits on later imports. */
export function knownDayNightPhrases(project: Project): Set<string> {
  return new Set([
    ...knownDayNightValues(project),
    ...Object.keys(project.headingAliases?.dayNight || {}),
  ].map(v => v.toUpperCase()));
}

/** Values in the incoming screenplay not known to the project and not already
 *  aliased — the ones to prompt for. */
export function collectUnknownHeadingValues(result: ImportResult, project: Project): { intExt: string[]; dayNight: string[] } {
  return collectUnknownFromValues(result.scenes, project);
}

/** Same, for an arbitrary set of heading values (e.g. only the scenes whose
 *  changes are actually accepted). */
export function collectUnknownFromValues(
  values: { intExt?: string; dayNight?: string }[],
  project: Project,
): { intExt: string[]; dayNight: string[] } {
  const aliases = project.headingAliases || {};
  const knownIE = new Set(knownIntExtValues(project).map(v => v.toUpperCase()));
  const knownDN = new Set(knownDayNightValues(project).map(v => v.toUpperCase()));
  const intExt = new Set<string>();
  const dayNight = new Set<string>();
  for (const s of values) {
    const ie = (s.intExt || '').toUpperCase();
    if (ie && !knownIE.has(ie) && !aliases.intExt?.[ie]) intExt.add(ie);
    const dn = (s.dayNight || '').toUpperCase();
    if (dn && !knownDN.has(dn) && !aliases.dayNight?.[dn]) dayNight.add(dn);
  }
  return { intExt: [...intExt], dayNight: [...dayNight] };
}

export interface AppliedHeadingMapping {
  result: ImportResult;
  /** New canonical values to add to the Colors options. */
  addedIntExt: string[];
  addedDayNight: string[];
  /** Raw → canonical aliases (merge into `project.headingAliases`). */
  aliases: HeadingAliases;
}

/** One raw value → canonical, recording a new "added" value or a raw→canonical
 *  alias. Shared by the ImportResult (append/diff) and Project (new-project)
 *  mapping paths so the rule lives in exactly one place. */
function mapHeadingValue(
  raw: string,
  table: Record<string, string>,
  added: string[],
  choice: Record<string, HeadingValueChoice> | undefined,
): string {
  const key = (raw || '').toUpperCase();
  if (!key) return raw;
  if (table[key]) return table[key];
  const c = choice?.[key];
  if (c?.action === 'map' && c.mapTo) {
    table[key] = c.mapTo;
    return c.mapTo;
  }
  if (c?.action === 'add') {
    if (!added.includes(key)) added.push(key);
    return key;
  }
  return raw;
}

/** Append option values not already present (case-insensitive). */
function mergeKnownValues(list: string[], extra: string[]): string[] {
  const set = new Set(list.map(v => v.toUpperCase()));
  return [...list, ...extra.filter(v => !set.has(v.toUpperCase()))];
}

/** Rewrite an ImportResult's scene heading values from the project's aliases +
 *  the user's choices. Pure. */
export function applyHeadingMapping(result: ImportResult, project: Project, mapping: HeadingMapping): AppliedHeadingMapping {
  const aliases: HeadingAliases = {
    intExt: { ...(project.headingAliases?.intExt || {}) },
    dayNight: { ...(project.headingAliases?.dayNight || {}) },
  };
  const addedIntExt: string[] = [];
  const addedDayNight: string[] = [];

  const scenes = result.scenes.map(s => ({
    ...s,
    intExt: mapHeadingValue(s.intExt, aliases.intExt!, addedIntExt, mapping.intExt),
    dayNight: mapHeadingValue(s.dayNight, aliases.dayNight!, addedDayNight, mapping.dayNight),
  }));

  return { result: { ...result, scenes }, addedIntExt, addedDayNight, aliases };
}

/** The project patch that records a mapping: new option values go on the
 *  Colors palette (source of truth); mapped values become aliases. */
export function buildHeadingMappingUpdate(project: Project, applied: AppliedHeadingMapping): Partial<Project> {
  const colorPalette = project.colorPalette
    ? {
        ...project.colorPalette,
        intExtOptions: mergeKnownValues(knownIntExtValues(project), applied.addedIntExt),
        dayNightOptions: mergeKnownValues(knownDayNightValues(project), applied.addedDayNight),
      }
    : project.colorPalette;
  return { colorPalette, headingAliases: applied.aliases };
}
