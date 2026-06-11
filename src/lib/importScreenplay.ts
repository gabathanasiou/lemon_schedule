import { Scene, IntExt, DayNight, CastMember } from '../types';
import { Fountain } from 'fountain-js';
import { generateUUID, parsePageCount, normalizePunctuation } from './utils';

export interface ParsedScene {
  sceneNumber: string;
  pageCount?: string;
  pageCountDecimal?: number;
  intExt: IntExt;
  set: string;
  dayNight: DayNight;
  description: string;
  characters: string[];
  taggedElements: Record<string, string[]>;
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

function normalizeCharacterName(name: string): string {
  return name.trim().toUpperCase().replace(/\s*\([^)]*\)\s*$/g, '').trim().replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

function parseSceneHeading(text: string, previousDayNight?: DayNight | 'DAY'): { intExt: IntExt; set: string; dayNight: DayNight } | null {
  const clean = text.replace(/\n/g, ' ').trim();
  const dotIdx = clean.indexOf('.');
  if (dotIdx === -1) return null;

  const prefix = clean.slice(0, dotIdx).trim();
  let rest = clean.slice(dotIdx + 1).trim();
  if (!rest) return null;

  const upperPrefix = prefix.toUpperCase();
  let intExt: IntExt = 'INT';
  if (upperPrefix === 'EXT' || upperPrefix.startsWith('EXT') || upperPrefix === 'ΕΞΩΤ') intExt = 'EXT';
  else if (upperPrefix === 'INT/EXT' || upperPrefix === 'INT-EXT' || upperPrefix === 'I/E' || upperPrefix.includes('/') || upperPrefix.includes('-')) intExt = 'INT/EXT';

  const TIME_WORDS = /\s*[–—\-]+\s*(?:LATE\s+|EARLY\s+|NEXT\s+)?(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|CONTINUOUS|LATER|SAME\s+TIME)\s*[-–—]*\s*$/i;

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
    dayNight = (previousDayNight as DayNight) || 'DAY';
  }

  set = normalizePunctuation(set).trim().toUpperCase().replace(/\s*\([^)]*\)\s*$/g, '').trim().replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (!set) set = rest.replace(/\s*\([^)]*\)\s*$/g, '').trim().toUpperCase();

  return { intExt, set, dayNight };
}

function buildFDXTagResolution(doc: Document): {
  tagCategory: Map<string, string>;
  tagDefLabel: Map<string, string>;
  tagToDef: Map<string, string>;
} {
  const tagCategory = new Map<string, string>();
  const tagDefLabel = new Map<string, string>();
  const tagToDef = new Map<string, string>();

  const categories = doc.querySelectorAll('TagData > TagCategories > TagCategory');
  for (const cat of categories) {
    const id = cat.getAttribute('Id');
    const name = cat.getAttribute('Name');
    if (id && name) tagCategory.set(id, name);
  }

  const definitions = doc.querySelectorAll('TagData > TagDefinitions > TagDefinition');
  for (const def of definitions) {
    const defId = def.getAttribute('Id') || def.getAttribute('DefId') || '';
    const catId = def.getAttribute('CatId');
    const label = def.getAttribute('Label');
    if (defId) {
      tagDefLabel.set(defId, label || '');
      if (catId) tagDefLabel.set(`${defId}_cat`, catId);
    }
  }

  const tags = doc.querySelectorAll('TagData > Tags > Tag');
  for (const tag of tags) {
    const number = tag.getAttribute('Number');
    const defId = tag.getAttribute('DefId') || tag.querySelector('DefId')?.textContent?.trim() || '';
    if (number && defId) tagToDef.set(number, defId);
  }

  return { tagCategory, tagDefLabel, tagToDef };
}

function resolveTagElement(
  tagNumber: string,
  elementText: string,
  maps: { tagCategory: Map<string, string>; tagDefLabel: Map<string, string>; tagToDef: Map<string, string> },
  unknownCategories: Set<string>,
): { categoryKey: string | null; elementName: string } | null {
  const defId = maps.tagToDef.get(tagNumber);
  if (!defId) return null;

  const catId = maps.tagDefLabel.get(`${defId}_cat`) || '';
  const catName = maps.tagCategory.get(catId);
  if (!catName) return null;

  const mappedKey = FDX_CATEGORY_MAP[catName];
  if (mappedKey === undefined || mappedKey === null) {
    unknownCategories.add(catName);
    const provisionalKey = categoryNameToKey(catName);
    const label = maps.tagDefLabel.get(defId) || '';
    const elementName = elementText.trim() || label;
    return { categoryKey: provisionalKey, elementName };
  }

  const label = maps.tagDefLabel.get(defId) || '';
  const elementName = elementText.trim() || label;

  return { categoryKey: mappedKey, elementName };
}

export async function parseFDX(file: File): Promise<ImportResult> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid FDX file: could not parse XML');

  const { tagCategory, tagDefLabel, tagToDef } = buildFDXTagResolution(doc);
  const unknownCategories = new Set<string>();

  const paragraphs = doc.querySelectorAll('Content > Paragraph');
  const scenes: ParsedScene[] = [];
  const characterMap = new Map<string, Set<number>>();
  let currentSceneNumber = '';
  let currentDescription = '';
  let currentHeading = '';
  let currentPageCount: string | undefined;
  let currentPageCountDecimal: number | undefined;
  const sceneCharacters = new Set<string>();
  const sceneTaggedElements = new Map<string, Set<string>>();
  let lastDayNight: DayNight = 'DAY';

  function flushScene() {
    if (!currentSceneNumber) return;
    for (const ch of sceneCharacters) {
      if (!characterMap.has(ch)) characterMap.set(ch, new Set());
      characterMap.get(ch)!.add(scenes.length);
    }
    const heading = parseSceneHeading(currentHeading, lastDayNight);
    const tagged: Record<string, string[]> = {};
    for (const [key, items] of sceneTaggedElements) tagged[key] = [...items];
    const dn = heading?.dayNight || lastDayNight;
    lastDayNight = dn;
    scenes.push({
      sceneNumber: currentSceneNumber,
      pageCount: currentPageCount,
      pageCountDecimal: currentPageCountDecimal,
      intExt: heading?.intExt || 'INT',
      set: heading?.set || currentHeading || 'UNKNOWN',
      dayNight: dn,
      description: '',
      characters: [...sceneCharacters],
      taggedElements: tagged,
    });
    currentSceneNumber = '';
    currentHeading = '';
    currentDescription = '';
    currentPageCount = undefined;
    currentPageCountDecimal = undefined;
    sceneCharacters.clear();
    sceneTaggedElements.clear();
  }

  for (const p of paragraphs) {
    const pType = p.getAttribute('Type') || '';
    const pNum = p.getAttribute('Number') || '';

    const textEls = p.querySelectorAll(':scope > Text');
    let textContent = '';
    const taggedTexts: { tagNumber: string; text: string }[] = [];

    for (const te of textEls) {
      const tn = te.getAttribute('TagNumber');
      const txt = te.textContent || '';
      if (tn) {
        taggedTexts.push({ tagNumber: tn, text: txt });
      } else {
        textContent += txt;
      }
    }

    if (pType === 'Scene Heading') {
      flushScene();
      currentSceneNumber = pNum || textContent.replace(/\D/g, '') || String(scenes.length + 1);
      currentHeading = textContent;

      const spEl = p.querySelector('SceneProperties');
      if (spEl) {
        const length = spEl.getAttribute('Length');
        if (length) {
          currentPageCount = length;
          currentPageCountDecimal = parsePageCount(length);
        }
      }
    } else if (pType === 'Character') {
      const name = normalizeCharacterName(textContent);
      if (name) sceneCharacters.add(name);
    } else if (pType === 'Action') {
      if (scenes.length === 0 && !currentSceneNumber) {
        currentSceneNumber = pNum || String(scenes.length + 1);
        currentHeading = textContent;
      }
    }

    for (const tt of taggedTexts) {
      const resolved = resolveTagElement(tt.tagNumber, tt.text, { tagCategory, tagDefLabel, tagToDef }, unknownCategories);
      if (resolved && resolved.categoryKey) {
        if (!sceneTaggedElements.has(resolved.categoryKey)) sceneTaggedElements.set(resolved.categoryKey, new Set());
        sceneTaggedElements.get(resolved.categoryKey)!.add(resolved.elementName);
      }
    }
  }

  flushScene();

  const characters: ImportCharacter[] = [];
  for (const [name, sceneNums] of characterMap) {
    characters.push({ name, scenes: [...sceneNums] });
  }

  const titleEl = doc.querySelector('Content > Title');
  const title = titleEl?.textContent?.trim() || undefined;

  return { title, scenes, characters, unknownCategories: [...unknownCategories] };
}

export async function parseFountain(file: File): Promise<ImportResult> {
  const text = await file.text();
  const fountain = new Fountain();
  const result = fountain.parse(text, true);
  const tokens = result.tokens;

  const scenes: ParsedScene[] = [];
  const characterMap = new Map<string, Set<number>>();
  let currentHeading = '';
  let currentSceneNumber = '';
  const descriptionLines: string[] = [];
  const sceneCharacters = new Set<string>();
  let lastDayNight: DayNight = 'DAY';

  function flushFountainScene() {
    if (!currentHeading && descriptionLines.length === 0 && sceneCharacters.size === 0) return;
    const heading = parseSceneHeading(currentHeading, lastDayNight);
    const dn = heading?.dayNight || lastDayNight;
    lastDayNight = dn;
    scenes.push({
      sceneNumber: currentSceneNumber || String(scenes.length + 1),
      intExt: heading?.intExt || 'INT',
      set: heading?.set || currentHeading || 'UNKNOWN',
      dayNight: dn,
      description: descriptionLines.join('\n'),
      characters: [...sceneCharacters],
      taggedElements: {},
    });
    for (const ch of sceneCharacters) {
      if (!characterMap.has(ch)) characterMap.set(ch, new Set());
      characterMap.get(ch)!.add(scenes.length - 1);
    }
    currentHeading = '';
    currentSceneNumber = '';
    descriptionLines.length = 0;
    sceneCharacters.clear();
  }

  for (const token of tokens) {
    if (token.type === 'scene_heading') {
      flushFountainScene();
      currentHeading = token.text || '';
      currentSceneNumber = (token as any).scene_number || '';
    } else if (token.type === 'character') {
      const name = normalizeCharacterName(token.text || '');
      if (name && !/^(INT|EXT|EST|I\/E|INT\.?\/EXT|INT[-–—]EXT)[.\s]/i.test(name)) sceneCharacters.add(name);
    } else if (token.type === 'action') {
      descriptionLines.push((token.text || '').trim());
    }
  }

  flushFountainScene();

  const characters: ImportCharacter[] = [];
  for (const [name, sceneNums] of characterMap) {
    characters.push({ name, scenes: [...sceneNums] });
  }

  return { title: result.title || undefined, scenes, characters, unknownCategories: [] };
}

export interface CommitImportParams {
  dispatch: (action: any) => void;
  result: ImportResult;
  castIdMap: Map<string, string>;
  newCustomCategories: string[];
  existingCastMembers: CastMember[];
  projectTitle?: string;
  reEnableCategories?: string[];
}

export function commitImport({
  dispatch,
  result,
  castIdMap,
  newCustomCategories,
  existingCastMembers,
  projectTitle,
  reEnableCategories = [],
}: CommitImportParams): void {
  if (projectTitle) {
    dispatch({ type: 'UPDATE_PROJECT', payload: { title: projectTitle } });
  }
  for (const key of reEnableCategories) {
    dispatch({ type: 'SHOW_CATEGORY', payload: key });
  }
  for (const catName of newCustomCategories) {
    const key = categoryNameToKey(catName);
    dispatch({ type: 'ADD_CUSTOM_CATEGORY', payload: { key, label: catName, icon: 'Tag' } });
  }

  const existingIds = new Set(existingCastMembers.map(c => c.id));
  for (const [name, id] of castIdMap) {
    if (existingIds.has(id)) continue;
    const upperName = name.toUpperCase();
    dispatch({ type: 'ADD_CAST_MEMBER', payload: { id, name: upperName } });
  }

  for (const [name, id] of castIdMap) {
    const upperName = name.toUpperCase();
    dispatch({ type: 'ADD_ELEMENT', payload: { category: 'cast', element: { id, name: upperName } } });
  }

  const SCENE_FIELD_KEYS = new Set(['notes', 'scriptDay', 'set', 'description']);

  const BUILTIN_BREAKDOWN_KEYS = new Set(
    Object.values(FDX_CATEGORY_MAP).filter((v): v is string => v !== null && !SCENE_FIELD_KEYS.has(v))
  );
  const selectedCustomKeys = new Set(newCustomCategories.map(categoryNameToKey));

  const allElements = new Map<string, Set<string>>();
  for (const ps of result.scenes) {
    for (const [cat, items] of Object.entries(ps.taggedElements)) {
      if (SCENE_FIELD_KEYS.has(cat)) continue;
      if (!BUILTIN_BREAKDOWN_KEYS.has(cat) && !selectedCustomKeys.has(cat)) continue;
      if (!allElements.has(cat)) allElements.set(cat, new Set());
      const set = allElements.get(cat)!;
      for (const item of items) set.add(item);
    }
  }
  for (const [cat, items] of allElements) {
    for (const item of items) {
      dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: item, name: item } } });
    }
  }

  for (const ps of result.scenes) {
    const castIds = ps.characters
      .map(name => {
        const upper = name.toUpperCase();
        for (const [original, assigned] of castIdMap) {
          if (original.toUpperCase() === upper) return assigned;
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');

    const breakdownFields: Record<string, string> = {};
    for (const [cat, items] of Object.entries(ps.taggedElements)) {
      breakdownFields[cat] = items.join(', ');
    }

    const sceneBase: any = {
      id: generateUUID(),
      sceneNumber: ps.sceneNumber,
      pageCount: ps.pageCount || '1',
      pageCountDecimal: ps.pageCountDecimal || 1,
      scriptDay: breakdownFields.scriptDay || '',
      intExt: ps.intExt,
      set: breakdownFields.set || ps.set.toUpperCase(),
      dayNight: ps.dayNight,
      description: breakdownFields.description || '',
      cast: castIds,
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
      shootDay: null,
    };

    for (const catName of newCustomCategories) {
      const key = categoryNameToKey(catName);
      if (breakdownFields[key]) sceneBase[key] = breakdownFields[key];
    }

    dispatch({ type: 'ADD_SCENE', payload: sceneBase });
  }
}
