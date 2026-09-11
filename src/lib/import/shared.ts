import { IntExt, DayNight, ScriptDocument } from '../../types';
import { normalizePunctuation } from '../utils';

export interface ParsedScene {
  sceneNumber: string;
  /** Script page the scene starts on (FDX <Page> markers / MSD ScriptPageNumbers). */
  scriptPageNumbers?: string;
  pageCount?: string;
  pageCountDecimal?: number;
  intExt: IntExt;
  set: string;
  dayNight: DayNight;
  description: string;
  characters: string[];
  taggedElements: Record<string, string[]>;
  rawCast?: string;
}

export interface ImportCharacter {
  name: string;
  scenes: number[];
}

export interface ImportResult {
  title?: string;
  scenes: ParsedScene[];
  characters: ImportCharacter[];
  unknownCategories: string[];
  /** Retained screenplay body (roadmap 123 Phase 0) — absent for CSV. */
  script?: ScriptDocument;
}

export const FDX_CATEGORY_MAP: Record<string, string | null> = {
  'Props': 'props',
  'Wardrobe': 'wardrobe',
  'Makeup/Hair': 'makeup',
  'Makeup / Hair': 'makeup',
  'Makeup': 'makeup',
  'Stunts': 'stunts',
  'Vehicles': 'vehicles',
  'Camera': null,
  'Music': 'music',
  'Sound': 'sound',
  'Set Dressing': null,
  'VFX': 'vfx',
  'Visual Effects': 'vfx',
  'SFX': 'sfx',
  'Special Effects': 'sfx',
  'Mechanical Effects': 'sfx',
  'Animals': 'animalsAndWranglers',
  'Animal Wrangler': 'animalsAndWranglers',
  'Greenery': 'greenery',
  'Art Department': 'artDept',
  'Security': null,
  'Additional Labor': null,
  'Background Actors': 'backgroundActors',
  'Extras': 'backgroundActors',
  'Weapons': 'weapons',
  'Armoury': 'weapons',
  'Special Equipment': null,
  'Miscellaneous': null,
  'Comments': null,
  'Script Day': 'scriptDay',
  'Sequence': null,
  'Unit': null,
  'Synopsis': 'description',
  'Location': 'location',
  'Cast Members': null,
  'Notes': 'notes',
};

export function categoryNameToKey(name: string): string {
  return name.replace(/\s+/g, '').replace(/^[A-Z]/, l => l.toLowerCase()).replace(/\/[a-z]/g, m => m.charAt(1).toUpperCase());
}

export function normalizeCharacterName(name: string): string {
  return name.trim().toUpperCase().replace(/\s*\([^)]*\)\s*$/g, '').trim().replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

export function parseSceneHeading(text: string, previousDayNight?: DayNight | 'DAY'): { intExt: IntExt; set: string; dayNight: DayNight } | null {
  // FDX/MSD headings often carry a scene number in the text ("1. INT. Corridor",
  // "12A - EXT. Field") — strip it so INT/EXT and the set don't merge.
  const clean = text.replace(/\n/g, ' ').trim().replace(/^\s*\d+[A-Za-z]?\s*[.):\-\u2013\u2014]?\s*/, '');
  const dotIdx = clean.indexOf('.');
  if (dotIdx === -1) return null;

  const prefix = clean.slice(0, dotIdx).trim();
  let rest = clean.slice(dotIdx + 1).trim();
  if (!rest) return null;

  const upperPrefix = prefix.toUpperCase();
  let intExt: IntExt = 'INT';
  // Greek INT (ΕΣΩΤ/ΕΣΩΤΕΡΙΚΟ) / EXT (ΕΞΩΤ/ΕΞΩΤΕΡΙΚΟ) alongside the English forms.
  if (upperPrefix === 'EXT' || upperPrefix.startsWith('EXT') || upperPrefix.startsWith('ΕΞΩΤ')) intExt = 'EXT';
  else if (upperPrefix.startsWith('ΕΣΩΤ') || upperPrefix === 'INT' || upperPrefix.startsWith('INT.')) intExt = 'INT';
  else if (upperPrefix === 'INT/EXT' || upperPrefix === 'INT-EXT' || upperPrefix === 'I/E' || upperPrefix.includes('/') || upperPrefix.includes('-')) intExt = 'INT/EXT';

  const TIME_WORDS = /\s*[\u2013\u2014\-]+\s*(?:LATE\s+|EARLY\s+|NEXT\s+)?(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|CONTINUOUS|LATER|SAME\s+TIME)\s*[-\u2013\u2014]*\s*$/i;
  // A generic "SET - WORD" suffix: a CUSTOM day/night (DREAM, MAGIC HOUR, …) we
  // keep verbatim rather than folding into the set. 2+ letters so set names
  // like "WING B" aren't mistaken for a time descriptor.
  const CUSTOM_TIME = /\s*[-\u2013\u2014]\s*([^\s-]{2,})\s*$/;

  let set = rest;
  let dayNight: DayNight = 'DAY';

  const match = rest.match(TIME_WORDS);
  if (match) {
    const timeWord = match[1].toUpperCase();
    if (timeWord === 'CONTINUOUS' || timeWord === 'LATER' || /^SAME\s*TIME$/.test(match[1])) {
      dayNight = (previousDayNight as DayNight) || 'DAY';
    } else {
      dayNight = timeWord as DayNight;
    }
    set = rest.slice(0, rest.length - match[0].length);
  } else {
    const custom = rest.match(CUSTOM_TIME);
    if (custom) {
      dayNight = custom[1].toUpperCase() as DayNight;
      set = rest.slice(0, rest.length - custom[0].length);
    } else {
      dayNight = (previousDayNight as DayNight) || 'DAY';
    }
  }

  set = normalizePunctuation(set).trim().toUpperCase().replace(/\s*\([^)]*\)\s*$/g, '').trim().replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (!set) set = rest.replace(/\s*\([^)]*\)\s*$/g, '').trim().toUpperCase();

  return { intExt, set, dayNight };
}
