import { Fountain } from 'fountain-js';
import { DayNight } from '../../types';
import { ImportCharacter, ImportResult, ParsedScene, normalizeCharacterName, parseSceneHeading } from './shared';

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
      if (name && !/^(INT|EXT|EST|I\/E|INT\.?\/EXT|INT[-\u2013\u2014]EXT)[.\s]/i.test(name)) sceneCharacters.add(name);
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
