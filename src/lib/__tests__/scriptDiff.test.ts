import { describe, it, expect } from 'vitest';
import { diffScripts, sceneBodyText } from '../import/scriptDiff';
import { createScriptDocument, createScriptScene, pushScriptBlock } from '../script';
import type { ParsedScene } from '../import/shared';
import type { Scene, ScriptDocument } from '../../types';

function scene(over: Partial<Scene>): Scene {
  return {
    id: over.id || `id-${over.sceneNumber}`,
    sceneNumber: '',
    pageCount: '0',
    pageCountDecimal: 0,
    scriptDay: '',
    intExt: 'INT',
    set: 'ROOM',
    location: '',
    dayNight: 'DAY',
    description: '',
    cast: '',
    notes: '',
    backgroundActors: '',
    stunts: '',
    vehicles: '',
    props: '',
    wardrobe: '',
    makeup: '',
    sfx: '',
    vfx: '',
    sound: '',
    music: '',
    animalsAndWranglers: '',
    weapons: '',
    greenery: '',
    artDept: '',
    ...over,
  } as Scene;
}

function parsed(over: Partial<ParsedScene>): ParsedScene {
  return {
    sceneNumber: '',
    intExt: 'INT',
    set: 'ROOM',
    dayNight: 'DAY',
    description: '',
    characters: [],
    taggedElements: {},
    ...over,
  };
}

function script(bodyByNumber: Record<string, string[]>): ScriptDocument {
  const doc = createScriptDocument('fdx');
  for (const [num, lines] of Object.entries(bodyByNumber)) {
    const s = createScriptScene(num);
    for (const line of lines) pushScriptBlock(s, 'action', line);
    doc.scenes.push(s);
  }
  return doc;
}

const opts = (oldBody?: ScriptDocument, newBody?: ScriptDocument) => ({
  castNameById: new Map<string, string>(),
  customCategories: [],
  oldBody,
  newBody,
});

describe('diffScripts', () => {
  it('identical scripts are all unchanged with zero page delta', () => {
    const oldScenes = [scene({ sceneNumber: '1', pageCountDecimal: 1 }), scene({ sceneNumber: '2', pageCountDecimal: 2 })];
    const newScenes = [parsed({ sceneNumber: '1', pageCountDecimal: 1 }), parsed({ sceneNumber: '2', pageCountDecimal: 2 })];
    const result = diffScripts(oldScenes, newScenes, opts());
    expect(result.entries.map(e => e.status)).toEqual(['unchanged', 'unchanged']);
    expect(result.summary).toEqual({ unchanged: 2, modified: 0, added: 0, removed: 0 });
    expect(result.pageDelta).toBe(0);
  });

  it('a changed scene body is a modified pair with a word diff, no id churn', () => {
    const oldScenes = [scene({ sceneNumber: '1' })];
    const newScenes = [parsed({ sceneNumber: '1' })];
    const result = diffScripts(
      oldScenes,
      newScenes,
      opts(script({ '1': ['AMY pours coffee.'] }), script({ '1': ['AMY pours tea.'] })),
    );
    expect(result.entries[0].status).toBe('modified');
    const body = result.entries[0].fields.find(f => f.key === 'body');
    expect(body?.wordChanges?.some(c => c.removed && c.value.includes('coffee'))).toBe(true);
    expect(body?.wordChanges?.some(c => c.added && c.value.includes('tea'))).toBe(true);
  });

  it('an inserted scene mid-list is added without cascading the later matches', () => {
    const oldScenes = [scene({ sceneNumber: '1' }), scene({ sceneNumber: '2' })];
    const newScenes = [parsed({ sceneNumber: '1' }), parsed({ sceneNumber: '1A', set: 'HALL' }), parsed({ sceneNumber: '2' })];
    const result = diffScripts(oldScenes, newScenes, opts());
    expect(result.entries.map(e => e.sceneNumber)).toEqual(['1', '1A', '2']);
    expect(result.entries.map(e => e.status)).toEqual(['unchanged', 'added', 'unchanged']);
  });

  it('a removed scene is detected from the alignment gap', () => {
    const oldScenes = [scene({ sceneNumber: '1' }), scene({ sceneNumber: '2' }), scene({ sceneNumber: '3' })];
    const newScenes = [parsed({ sceneNumber: '1' }), parsed({ sceneNumber: '3' })];
    const result = diffScripts(oldScenes, newScenes, opts());
    expect(result.entries.map(e => e.status)).toEqual(['unchanged', 'removed', 'unchanged']);
    expect(result.entries[1].sceneNumber).toBe('2');
  });

  it('matches a renumbered scene by heading/body similarity', () => {
    const oldBody = script({ '1': ['GEORGE runs down the snowy street.'] });
    const newBody = script({ '7': ['GEORGE runs down the snowy street.'] });
    const oldScenes = [scene({ sceneNumber: '1', set: 'STREET' })];
    const newScenes = [parsed({ sceneNumber: '7', set: 'STREET' })];
    const result = diffScripts(oldScenes, newScenes, opts(oldBody, newBody));
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    // Matched, but the NUMBER changed — a diffable field, not a whole replace.
    expect(result.entries[0].status).toBe('modified');
    expect(result.entries[0].fields.find(f => f.key === 'sceneNumber')).toMatchObject({ before: '1', after: '7' });
  });

  it('diffs element sets as added/removed names', () => {
    const oldScenes = [scene({ sceneNumber: '1', props: 'KNIFE, ROPE' })];
    const newScenes = [parsed({ sceneNumber: '1', taggedElements: { props: ['KNIFE', 'LAMP'] } })];
    const result = diffScripts(oldScenes, newScenes, opts());
    const props = result.entries[0].fields.find(f => f.key === 'props');
    expect(props?.added).toEqual(['LAMP']);
    expect(props?.removed).toEqual(['ROPE']);
  });

  it('flags a split: an added high-similarity fragment of a matched scene', () => {
    const oldBody = script({ '8': ['The bank runs. George cheers wildly.'] });
    const newBody = script({
      '8A': ['The bank runs.'],
      '8B': ['George cheers wildly.'],
    });
    const oldScenes = [scene({ sceneNumber: '8' })];
    const newScenes = [parsed({ sceneNumber: '8A' }), parsed({ sceneNumber: '8B' })];
    const result = diffScripts(oldScenes, newScenes, opts(oldBody, newBody));
    const added = result.entries.find(e => e.status === 'added');
    expect(added?.splitOf).toBeTruthy();
  });

  it('detects a global character rename (old name → same scenes)', () => {
    const oldScenes = [scene({ sceneNumber: '1', cast: '1' }), scene({ sceneNumber: '2', cast: '1' })];
    const newScenes = [
      parsed({ sceneNumber: '1', characters: ['ANNA'] }),
      parsed({ sceneNumber: '2', characters: ['ANNA'] }),
    ];
    const result = diffScripts(oldScenes, newScenes, {
      castNameById: new Map([['1', 'AMY']]),
      customCategories: [],
    });
    expect(result.castRenames).toEqual([{ from: 'AMY', to: 'ANNA' }]);
    expect(result.entries.every(e => e.fields.some(f => f.key === 'cast'))).toBe(true);
  });

  it('matches an UNNUMBERED old scene to a newly-numbered incoming scene', () => {
    const oldBody = script({ '': ['GEORGE runs down the snowy street.'] });
    const newBody = script({ '5': ['GEORGE runs down the snowy street.'] });
    const oldScenes = [scene({ sceneNumber: '', set: 'STREET' })];
    const newScenes = [parsed({ sceneNumber: '5', set: 'STREET' })];
    const result = diffScripts(oldScenes, newScenes, opts(oldBody, newBody));
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    // Matched by heading/body; the scene gained a number (a diffable field).
    expect(result.entries[0].status).toBe('modified');
    expect(result.entries[0].sceneNumber).toBe('5');
    expect(result.entries[0].fields.find(f => f.key === 'sceneNumber')).toMatchObject({ after: '5' });
  });

  it('treats an incoming scene as NEW when the project no longer has it (deleted in-app)', () => {
    const oldScenes = [scene({ sceneNumber: '1' })];
    const newScenes = [parsed({ sceneNumber: '1' }), parsed({ sceneNumber: '2', set: 'FIELD' })];
    const result = diffScripts(oldScenes, newScenes, opts());
    expect(result.entries.map(e => e.status)).toEqual(['unchanged', 'added']);
  });
});

describe('sceneBodyText', () => {
  it('joins non-page-break block text for the scene number', () => {
    const doc = createScriptDocument('fdx');
    const s = createScriptScene('3');
    pushScriptBlock(s, 'heading', 'INT. ROOM - DAY');
    pushScriptBlock(s, 'page_break', '');
    pushScriptBlock(s, 'action', 'Something happens.');
    doc.scenes.push(s);
    expect(sceneBodyText(doc, '3')).toBe('INT. ROOM - DAY\nSomething happens.');
    expect(sceneBodyText(doc, '9')).toBe('');
    expect(sceneBodyText(undefined, '3')).toBe('');
  });
});
