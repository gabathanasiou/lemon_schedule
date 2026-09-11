import { DayNight, ScriptBlockType, ScriptScene } from '../../types';
import { parsePageCount } from '../utils';
import { createScriptDocument, createScriptScene, pushScriptBlock } from '../script';
import { FDX_CATEGORY_MAP, ImportCharacter, ImportResult, ParsedScene, categoryNameToKey, normalizeCharacterName, parseSceneHeading } from './shared';

/** FDX paragraph Type → retained script body block. `Scene Heading`,
 *  `Character` and `Action` are handled separately (they also drive the
 *  breakdown). Dual dialogue has no reliable marker in the paragraph stream we
 *  read, so FDX dialogue stays single-column (Fountain carries dual explicitly). */
const SCRIPT_BLOCK_TYPE: Record<string, ScriptBlockType> = {
  Parenthetical: 'parenthetical',
  Dialogue: 'dialogue',
  Transition: 'transition',
  Shot: 'shot',
};

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
  // Script page of the last <Page Number> break marker — the page the current
  // scene heading starts on (scriptPageNumbers; single-value like MSD's
  // ScriptPageNumbers until full-FDX rendering lands).
  let currentScriptPage: string | undefined;
  let currentScriptPageForScene: string | undefined;
  const sceneCharacters = new Set<string>();
  const sceneTaggedElements = new Map<string, Set<string>>();
  let lastDayNight: DayNight = 'DAY';
  const scriptScenes: ScriptScene[] = [];
  let currentScriptScene: ScriptScene | null = null;

  function startScriptScene(sceneNumber: string, scriptPage?: string) {
    currentScriptScene = createScriptScene(sceneNumber, scriptPage);
    scriptScenes.push(currentScriptScene);
  }

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
      scriptPageNumbers: currentScriptPageForScene,
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
    currentScriptPageForScene = undefined;
    sceneCharacters.clear();
    sceneTaggedElements.clear();
    currentScriptScene = null;
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

    // FDX embeds <Page Number> at print page breaks; keep the marker as a
    // page_break block and track the script page of whatever scene follows.
    if (pType !== 'Scene Heading') {
      for (const child of Array.from(p.children)) {
        if (child.tagName === 'Page') {
          const n = child.getAttribute('Number');
          if (n) currentScriptPage = n;
          if (currentScriptScene) pushScriptBlock(currentScriptScene, 'page_break', '');
        }
      }
    }

    if (pType === 'Scene Heading') {
      flushScene();
      currentSceneNumber = pNum || textContent.replace(/\D/g, '') || String(scenes.length + 1);
      currentHeading = textContent;

      for (const child of Array.from(p.children)) {
        if (child.tagName === 'Page') {
          const n = child.getAttribute('Number');
          if (n) currentScriptPage = n;
        } else if (child.tagName === 'SceneProperties') {
          const length = child.getAttribute('Length');
          if (length) {
            currentPageCount = length;
            currentPageCountDecimal = parsePageCount(length);
          }
        }
      }
      currentScriptPageForScene = currentScriptPage;
      startScriptScene(currentSceneNumber, currentScriptPageForScene);
      pushScriptBlock(currentScriptScene!, 'heading', currentHeading);
    } else if (pType === 'Character') {
      const name = normalizeCharacterName(textContent);
      if (name) sceneCharacters.add(name);
      if (currentScriptScene) pushScriptBlock(currentScriptScene, 'character', textContent);
    } else if (pType === 'Action') {
      if (scenes.length === 0 && !currentSceneNumber) {
        currentSceneNumber = pNum || String(scenes.length + 1);
        currentHeading = textContent;
        startScriptScene(currentSceneNumber, currentScriptPage);
      }
      if (currentScriptScene) pushScriptBlock(currentScriptScene, 'action', textContent);
    } else if (currentScriptScene && SCRIPT_BLOCK_TYPE[pType]) {
      pushScriptBlock(currentScriptScene, SCRIPT_BLOCK_TYPE[pType], textContent);
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

  const script = createScriptDocument('fdx', title ? { title } : undefined);
  script.scenes = scriptScenes;

  return { title, scenes, characters, unknownCategories: [...unknownCategories], script };
}
