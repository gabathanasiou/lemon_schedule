import type { Project } from '../types';

/**
 * The "smart" tag vocabulary for the Glide Breakdown row filter (roadmap 172).
 *
 * A tag that exactly equals one of these values is matched as a WHOLE WORD, so
 * short domain values stop colliding with prose: `int` no longer matches
 * "into"/"point", `night` no longer matches "Overnight". Everything else stays
 * a substring search, so partial names/sets still work (`drug` → DRUGSTORE).
 *
 * The vocabulary is DERIVED, never a literal list:
 * - Colors: the I/E + D/N palette options and the scene-colour matrix values.
 * - Database: every cast member and breakdown-element name (all categories,
 *   including custom ones).
 * - Locations: the Locations DB names (scenes carry a `location` string).
 * - Safety net: I/E + D/N values actually used on scenes (legacy imports whose
 *   value predates the palette).
 *
 * Only values that can appear in a scene's fields belong here — performer
 * details, crew roles, day types and category labels are not scene values, and
 * adding them would make their tags whole-word without any cell to match.
 */
export function sceneFilterVocabulary(project: Project): ReadonlySet<string> {
  const values = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim().toLowerCase();
    if (trimmed) values.add(trimmed);
  };

  const palette = project.colorPalette;
  for (const value of palette?.intExtOptions ?? []) add(value);
  for (const value of palette?.dayNightOptions ?? []) add(value);
  for (const entry of palette?.sceneColors ?? []) {
    add(entry.intExt);
    add(entry.dayNight);
  }

  for (const member of project.castMembers ?? []) add(member.name);
  for (const list of Object.values(project.breakdownElements ?? {})) {
    for (const element of list ?? []) add(element.name);
  }
  for (const location of project.locations ?? []) add(location.name);

  // Values used before a palette entry existed (older imports).
  for (const scene of project.scenes ?? []) {
    add(scene.intExt);
    add(scene.dayNight);
  }

  return values;
}
