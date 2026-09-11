import { describe, it, expect } from 'vitest';
import { createScriptDocument, createScriptScene, pushScriptBlock } from '../script';
import { parseFountain } from '../import/fountain';

const file = (text: string, name = 'test.fountain') => new File([text], name);

describe('script document builders', () => {
  it('builds a compact document with tuple blocks', () => {
    const doc = createScriptDocument('fountain', { title: 'X' });
    const scene = createScriptScene('1', '2');
    pushScriptBlock(scene, 'heading', 'INT. ROOM - DAY');
    pushScriptBlock(scene, 'action', 'Something happens.');
    pushScriptBlock(scene, 'page_break', '');
    doc.scenes.push(scene);
    expect(doc).toEqual({
      format: 'fountain',
      titlePage: { title: 'X' },
      scenes: [{
        sceneNumber: '1',
        scriptPage: '2',
        blocks: [
          ['heading', 'INT. ROOM - DAY'],
          ['action', 'Something happens.'],
          ['page_break', ''],
        ],
      }],
    });
  });

  it('omits an empty title page', () => {
    expect(createScriptDocument('fdx').titlePage).toBeUndefined();
  });
});

describe('parseFountain retains the screenplay body', () => {
  const src = [
    'Title: THE TEST',
    'Author: Jane',
    '',
    'INT. KITCHEN - DAY',
    '',
    'Amy pours coffee.',
    '',
    'BOB',
    'Hello there.',
    '',
    'AMY',
    '(laughing)',
    'Hi Bob.',
    '',
    '===',
    '',
    'EXT. STREET - NIGHT',
    '',
    'BOB',
    'Simultaneous line.',
    '',
    'AMY ^',
    'Other simultaneous line.',
    '',
    '> CUT TO:',
  ].join('\n');

  it('emits heading/action/character/dialogue/parenthetical/transition blocks', async () => {
    const result = await parseFountain(file(src));
    const script = result.script!;
    expect(script.format).toBe('fountain');
    expect(script.titlePage).toMatchObject({ title: 'THE TEST', author: 'Jane' });
    expect(script.scenes.map(s => s.sceneNumber)).toEqual(['1', '2']);

    const first = script.scenes[0];
    expect(first.blocks).toEqual([
      ['heading', 'INT. KITCHEN - DAY'],
      ['action', 'Amy pours coffee.'],
      ['character', 'BOB'],
      ['dialogue', 'Hello there.'],
      ['character', 'AMY'],
      ['parenthetical', '(laughing)'],
      ['dialogue', 'Hi Bob.'],
      ['page_break', ''],
    ]);

    const second = script.scenes[1];
    expect(second.blocks[0]).toEqual(['heading', 'EXT. STREET - NIGHT']);
    expect(second.blocks).toContainEqual(['transition', '> CUT TO:']);
  });

  it('keeps dual dialogue columns as dual_left/dual_right', async () => {
    const result = await parseFountain(file(src));
    const blocks = result.script!.scenes[1].blocks;
    expect(blocks).toContainEqual(['dual_left', 'Simultaneous line.']);
    expect(blocks).toContainEqual(['dual_right', 'Other simultaneous line.']);
    expect(blocks.some(([t]) => t === 'dialogue')).toBe(false);
  });

  it('records a page break between scenes', async () => {
    const result = await parseFountain(file(src));
    const all = result.script!.scenes.flatMap(s => s.blocks);
    expect(all).toContainEqual(['page_break', '']);
  });

  it('keeps the breakdown parser output unchanged (scenes/characters)', async () => {
    const result = await parseFountain(file(src));
    expect(result.scenes).toHaveLength(2);
    expect(result.characters.map(c => c.name).sort()).toEqual(['AMY', 'BOB']);
  });
});
