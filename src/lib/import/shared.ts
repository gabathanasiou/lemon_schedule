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

/** Multi-word custom day/night phrases kept verbatim (roadmap 127) — the tail
 *  after the last dash when it matches a known film time-of-day phrase. */
const CUSTOM_TIME_PHRASES = new Set([
  'MAGIC HOUR', 'GOLDEN HOUR', 'BLUE HOUR', 'HAPPY HOUR',
  'FIRST LIGHT', 'LAST LIGHT', 'DEAD OF NIGHT', 'WEE HOURS',
  'LATER THAT DAY', 'LATER THAT NIGHT', 'LATER THAT MORNING', 'LATER THAT EVENING',
  'EARLY MORNING', 'EARLY EVENING', 'LATE NIGHT', 'LATE AFTERNOON',
  'MOMENTS LATER', 'MOMENT LATER', 'NEXT DAY', 'NEXT MORNING', 'NEXT NIGHT', 'SAME NIGHT',
]);

/** Tokens that strongly indicate a time-of-day descriptor when they appear in a
 *  2–3 word tail (`MAGIC HOUR`) — deliberately excludes DAY/NIGHT/MORNING so set
 *  qualifiers like "DAY ROOM" / "NIGHT WARD" are not misread. */
const STRONG_TIME_TOKENS = new Set([
  'HOUR', 'TIME', 'LATER', 'MOMENT', 'MOMENTS', 'DAWN', 'DUSK',
  'NOON', 'MIDNIGHT', 'SUNSET', 'SUNRISE', 'TWILIGHT', 'NIGHTFALL',
]);

/** Index of the last hyphen/en-dash/em-dash in `s`, or -1. */
function lastDashIndex(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (c === '-' || c === '\u2013' || c === '\u2014') return i;
  }
  return -1;
}

function normalizeTimePhrase(s: string): string {
  return s.toUpperCase().replace(/[\u2018\u2019\u201c\u201d"']/g, '').replace(/\s+/g, ' ').trim();
}

export function parseSceneHeading(text: string, previousDayNight?: DayNight | 'DAY', knownDayNight?: Iterable<string>): { intExt: IntExt; set: string; dayNight: DayNight } | null {
  // FDX/MSD headings often carry a scene number in the text ("1. INT. Corridor",
  // "12A - EXT. Field") — strip it so INT/EXT and the set don't merge.
  const clean = text.replace(/\n/g, ' ').trim().replace(/^\s*\d+[A-Za-z]?\s*[.):\-\u2013\u2014]?\s*/, '');
  const dotIdx = clean.indexOf('.');
  if (dotIdx === -1) return null;

  const prefix = clean.slice(0, dotIdx).trim();
  let rest = clean.slice(dotIdx + 1).trim();
  if (!rest) return null;

  const upperPrefix = prefix.toUpperCase();
  let intExt: IntExt;
  // Greek INT (ΕΣΩΤ/ΕΣΩΤΕΡΙΚΟ) / EXT (ΕΞΩΤ/ΕΞΩΤΕΡΙΚΟ) alongside the English forms.
  if (upperPrefix === 'EXT' || upperPrefix.startsWith('EXT') || upperPrefix === 'EST' || upperPrefix.startsWith('ΕΞΩΤ')) intExt = 'EXT';
  else if (upperPrefix.startsWith('ΕΣΩΤ') || upperPrefix === 'INT' || upperPrefix.startsWith('INT.')) intExt = 'INT';
  else if (upperPrefix === 'INT/EXT' || upperPrefix === 'INT-EXT' || upperPrefix === 'I/E' || upperPrefix.includes('/') || upperPrefix.includes('-')) intExt = 'INT/EXT';
  // Unrecognized prefix (another language) — surface the RAW value so the import
  // can map it (roadmap 127) instead of silently defaulting to INT.
  else intExt = upperPrefix || 'INT';

  const TIME_WORDS = /\s*[\u2013\u2014\-]+\s*(?:LATE\s+|EARLY\s+|NEXT\s+)?(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|CONTINUOUS|LATER|SAME\s+TIME)\s*[-\u2013\u2014]*\s*$/i;
  const known = knownDayNight ? new Set([...knownDayNight].map(v => normalizeTimePhrase(v))) : undefined;

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
    // The tail after the last dash is a CUSTOM day/night when it is: a single
    // word (DREAM, ΝΥΧΤΑ), a known/curated multi-word phrase (MAGIC HOUR), or a
    // short tail carrying a strong time token. Otherwise it stays part of the set
    // ("WING B", "LIVING ROOM").
    const dash = lastDashIndex(rest);
    const phrase = dash >= 0 ? normalizeTimePhrase(rest.slice(dash + 1)) : '';
    const words = phrase.split(' ').filter(Boolean);
    const singleToken = words.length === 1 && words[0].replace(/[^\p{L}\p{N}]/gu, '').length >= 2;
    const isCustom = !!phrase && (
      singleToken ||
      CUSTOM_TIME_PHRASES.has(phrase) ||
      (known?.has(phrase) ?? false) ||
      (words.length >= 2 && words.length <= 3 && words.some(w => STRONG_TIME_TOKENS.has(w)))
    );
    if (isCustom) {
      dayNight = phrase;
      set = rest.slice(0, dash).trim();
    } else {
      dayNight = (previousDayNight as DayNight) || 'DAY';
    }
  }

  set = normalizePunctuation(set).trim().toUpperCase().replace(/\s*\([^)]*\)\s*$/g, '').trim().replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (!set) set = rest.replace(/\s*\([^)]*\)\s*$/g, '').trim().toUpperCase();

  return { intExt, set, dayNight };
}
