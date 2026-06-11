import { Scene, IntExt, DayNight, CastMember } from '../types';
import { Fountain } from 'fountain-js';
import { generateUUID, parsePageCount } from './utils';

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
  'SFX': 'sfx',
  'Animals': 'animalsAndWranglers',
  'Animal Wrangler': 'animalsAndWranglers',
  'Greenery': 'greenery',
  'Art Department': 'artDept',
  'Security': null,
  'Additional Labor': null,
  'Background Actors': 'backgroundActors',
  'Extras': 'backgroundActors',
  'Weapons': 'weapons',
  'Special Effects': 'sfx',
  'Armoury': 'weapons',
};

function parseSceneHeading(text: string): { intExt: IntExt; set: string; dayNight: DayNight } | null {
  const clean = text.replace(/\n/g, ' ').trim();
  const match = clean.match(/^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)\s*\.?\s+(.+?)\s*[-–—–]\s*(DAY|NIGHT|MORNING|EVENING|DAWN|DUSK)\s*$/i);
  if (!match) return null;
  const prefix = match[1].replace(/\./g, '').toUpperCase().trim();
  const intExt: IntExt = prefix === 'EXT' ? 'EXT' : prefix === 'INT/EXT' || prefix === 'I/E' ? 'INT/EXT' : 'INT';
  return {
    intExt,
    set: match[2].trim(),
    dayNight: match[3].toUpperCase() as DayNight,
  };
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
    const defId = def.getAttribute('DefId');
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
    const defId = tag.getAttribute('DefId');
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
  if (mappedKey === undefined) {
    unknownCategories.add(catName);
    return null;
  }
  if (mappedKey === null) {
    unknownCategories.add(catName);
    return null;
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
  let descriptionLines: string[] = [];
  const sceneCharacters = new Set<string>();
  const sceneTaggedElements = new Map<string, Set<string>>();

  function flushScene() {
    if (!currentSceneNumber) return;
    for (const ch of sceneCharacters) {
      if (!characterMap.has(ch)) characterMap.set(ch, new Set());
      characterMap.get(ch)!.add(scenes.length);
    }
    const heading = parseSceneHeading(currentHeading);
    const tagged: Record<string, string[]> = {};
    for (const [key, items] of sceneTaggedElements) tagged[key] = [...items];
    scenes.push({
      sceneNumber: currentSceneNumber,
      intExt: heading?.intExt || 'INT',
      set: heading?.set || currentHeading || 'UNKNOWN',
      dayNight: heading?.dayNight || 'DAY',
      description: descriptionLines.length > 0 ? descriptionLines.join('\n') : currentDescription,
      characters: [...sceneCharacters],
      taggedElements: tagged,
    });
    currentSceneNumber = '';
    currentHeading = '';
    currentDescription = '';
    descriptionLines = [];
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
    } else if (pType === 'Character') {
      const name = textContent.trim().toUpperCase();
      if (name) sceneCharacters.add(name);
    } else if (pType === 'Action') {
      if (scenes.length === 0 && !currentSceneNumber) {
        currentSceneNumber = pNum || String(scenes.length + 1);
        currentHeading = textContent;
      } else {
        descriptionLines.push(textContent.trim());
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

  return { scenes, characters, unknownCategories: [...unknownCategories] };
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

  function flushFountainScene() {
    if (!currentHeading && descriptionLines.length === 0 && sceneCharacters.size === 0) return;
    const heading = parseSceneHeading(currentHeading);
    scenes.push({
      sceneNumber: currentSceneNumber || String(scenes.length + 1),
      intExt: heading?.intExt || 'INT',
      set: heading?.set || currentHeading || 'UNKNOWN',
      dayNight: heading?.dayNight || 'DAY',
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
      const name = (token.text || '').trim().toUpperCase();
      if (name) sceneCharacters.add(name);
    } else if (token.type === 'action') {
      descriptionLines.push((token.text || '').trim());
    }
  }

  flushFountainScene();

  const characters: ImportCharacter[] = [];
  for (const [name, sceneNums] of characterMap) {
    characters.push({ name, scenes: [...sceneNums] });
  }

  return { scenes, characters, unknownCategories: [] };
}

export interface CommitImportParams {
  dispatch: (action: any) => void;
  result: ImportResult;
  castIdMap: Map<string, string>;
  newCustomCategories: string[];
  existingCastMembers: CastMember[];
}

export function commitImport({
  dispatch,
  result,
  castIdMap,
  newCustomCategories,
  existingCastMembers,
}: CommitImportParams): void {
  for (const catName of newCustomCategories) {
    const key = catName.replace(/\s+/g, '').replace(/^[A-Z]/, l => l.toLowerCase()).replace(/\/[a-z]/g, m => m.charAt(1).toUpperCase());
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

  const allElements = new Map<string, Set<string>>();
  for (const ps of result.scenes) {
    for (const [cat, items] of Object.entries(ps.taggedElements)) {
      if (!allElements.has(cat)) allElements.set(cat, new Set());
      const set = allElements.get(cat)!;
      for (const item of items) set.add(item);
    }
  }
  for (const [cat, items] of allElements) {
    for (const item of items) {
      dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: generateUUID(), name: item } } });
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
      scriptDay: '',
      intExt: ps.intExt,
      set: ps.set.toUpperCase(),
      dayNight: ps.dayNight,
      description: ps.description,
      cast: castIds,
      notes: '',
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
      const key = catName.replace(/\s+/g, '').replace(/^[A-Z]/, l => l.toLowerCase()).replace(/\/[a-z]/g, m => m.charAt(1).toUpperCase());
      if (breakdownFields[key]) sceneBase[key] = breakdownFields[key];
    }

    dispatch({ type: 'ADD_SCENE', payload: sceneBase });
  }
}
