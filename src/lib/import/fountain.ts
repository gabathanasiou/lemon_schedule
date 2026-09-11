import { Fountain } from 'fountain-js';
import { DayNight, ScriptBlockType, ScriptScene, ScriptTitlePage } from '../../types';
import { createScriptDocument, createScriptScene, pushScriptBlock } from '../script';
import { ImportCharacter, ImportResult, ParsedScene, normalizeCharacterName, parseSceneHeading } from './shared';

/** Fountain token `type` → retained script body block. `scene_heading`,
 *  `character` and `action` are handled separately (they also drive the
 *  breakdown). */
const SCRIPT_BLOCK_TYPE: Record<string, ScriptBlockType> = {
  parenthetical: 'parenthetical',
  transition: 'transition',
  centered: 'action',
  lyrics: 'action',
};

export async function parseFountain(file: File, knownDayNight?: Iterable<string>): Promise<ImportResult> {
  const text = await file.text();
  const fountain = new Fountain();
  const result = fountain.parse(text, true);
  const tokens = result.tokens;

  const scenes: ParsedScene[] = [];
  const characterMap = new Map<string, Set<number>>();
  const scriptScenes: ScriptScene[] = [];
  const titlePage: ScriptTitlePage = {};
  let currentScriptScene: ScriptScene | null = null;
  let currentDual: 'left' | 'right' | null = null;
  let currentHeading = '';
  let currentSceneNumber = '';
  const descriptionLines: string[] = [];
  const sceneCharacters = new Set<string>();
  let lastDayNight: DayNight = 'DAY';

  function ensureScriptScene(): ScriptScene {
    if (!currentScriptScene) currentScriptScene = createScriptScene(currentSceneNumber);
    return currentScriptScene;
  }

  function flushFountainScene() {
    if (!currentHeading && descriptionLines.length === 0 && sceneCharacters.size === 0) return;
    const sceneNumber = currentSceneNumber || String(scenes.length + 1);
    const heading = parseSceneHeading(currentHeading, lastDayNight, knownDayNight);
    const dn = heading?.dayNight || lastDayNight;
    lastDayNight = dn;
    scenes.push({
      sceneNumber,
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
    if (currentScriptScene) {
      currentScriptScene.sceneNumber = sceneNumber;
      scriptScenes.push(currentScriptScene);
      currentScriptScene = null;
    }
    currentHeading = '';
    currentSceneNumber = '';
    currentDual = null;
    descriptionLines.length = 0;
    sceneCharacters.clear();
  }

  for (const token of tokens) {
    if (token.is_title) {
      if (token.type && token.text) titlePage[token.type] = token.text;
      continue;
    }
    if (token.type === 'scene_heading') {
      flushFountainScene();
      currentHeading = token.text || '';
      currentSceneNumber = (token as any).scene_number || '';
      currentScriptScene = createScriptScene(currentSceneNumber);
      pushScriptBlock(currentScriptScene, 'heading', currentHeading);
    } else if (token.type === 'character') {
      const name = normalizeCharacterName(token.text || '');
      if (name && !/^(INT|EXT|EST|I\/E|INT\.?\/EXT|INT[-\u2013\u2014]EXT)[.\s]/i.test(name)) sceneCharacters.add(name);
      pushScriptBlock(ensureScriptScene(), 'character', token.text || '');
    } else if (token.type === 'action') {
      descriptionLines.push((token.text || '').trim());
      pushScriptBlock(ensureScriptScene(), 'action', (token.text || '').trim());
    } else if (token.type === 'dialogue_begin') {
      currentDual = token.dual === 'left' || token.dual === 'right' ? token.dual : null;
    } else if (token.type === 'dialogue_end' || token.type === 'dual_dialogue_end') {
      currentDual = null;
    } else if (token.type === 'dialogue') {
      const blockType: ScriptBlockType =
        currentDual === 'left' ? 'dual_left' : currentDual === 'right' ? 'dual_right' : 'dialogue';
      pushScriptBlock(ensureScriptScene(), blockType, token.text || '');
    } else if (token.type === 'page_break') {
      pushScriptBlock(ensureScriptScene(), 'page_break', '');
    } else if (SCRIPT_BLOCK_TYPE[token.type]) {
      pushScriptBlock(ensureScriptScene(), SCRIPT_BLOCK_TYPE[token.type], (token.text || '').trim());
    }
  }

  flushFountainScene();

  const characters: ImportCharacter[] = [];
  for (const [name, sceneNums] of characterMap) {
    characters.push({ name, scenes: [...sceneNums] });
  }

  const script = createScriptDocument('fountain', titlePage);
  script.scenes = scriptScenes;

  return { title: result.title || undefined, scenes, characters, unknownCategories: [], script };
}
